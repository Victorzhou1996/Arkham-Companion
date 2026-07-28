module Api.Handler.Arkham.Decks (
  getApiV1ArkhamDecksR,
  getApiV1ArkhamDeckR,
  postApiV1ArkhamDecksR,
  postApiV1ArkhamDecksFetchR,
  postApiV1ArkhamDecksValidateR,
  putApiV1ArkhamDeckR,
  deleteApiV1ArkhamDeckR,
  putApiV1ArkhamGameDecksR,
  postApiV1ArkhamSyncDeckR,
  campaignDeckName,
  campaignMetaText,
  setCampaignDeckMeta,
) where

import Import hiding (delete, on, update, (=.), (==.))

import Api.Arkham.Helpers
import Api.Handler.Arkham.Games.Shared (publishToRoom)
import Arkham.Card.CardCode
import Arkham.Classes.HasQueue
import Arkham.Decklist
import Arkham.Game
import Arkham.Game.Diff
import Arkham.Id
import Arkham.Investigator.Cards (allInvestigatorCards)
import Arkham.Message
import Arkham.PlayerCard
import Arkham.Queue
import Control.Lens (view)
import Control.Monad.Random (mkStdGen)
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as BL
import Data.Map.Strict qualified as Map
import Data.Text qualified as T
import Data.Text.Encoding qualified as TE
import Data.Time.Clock
import Database.Esqueleto.Experimental hiding (isNothing, (<&>))
import Entity.Arkham.Step
import Json hiding (Success)
import Network.HTTP.Conduit (httpLbs, newManager, parseRequest, requestHeaders, responseBody, simpleHttp, tlsManagerSettings)
import Network.HTTP.Types
import Network.HTTP.Types.Status qualified as Status
import OpenTelemetry.Trace.Monad (MonadTracer (..))

getApiV1ArkhamDecksR :: Handler [Entity ArkhamDeck]
getApiV1ArkhamDecksR = do
  userId <- getRequestUserId
  runDB $ select do
    decks <- from $ table @ArkhamDeck
    where_ $ decks.userId ==. val userId
    pure decks

data CreateDeckPost = CreateDeckPost
  { deckId :: Text
  , deckName :: Text
  , deckUrl :: Maybe Text
  , deckList :: ArkhamDBDecklist
  }
  deriving stock (Show, Generic)
  deriving anyclass FromJSON

newtype ValidateDeckPost = ValidateDeckPost
  { validateDeckList :: ArkhamDBDecklist
  }
  deriving stock (Show, Generic)
  deriving anyclass FromJSON

newtype FetchDeckPost = FetchDeckPost
  { fetchDeckUrl :: Text
  }
  deriving stock (Show, Generic)

instance FromJSON FetchDeckPost where
  parseJSON = genericParseJSON $ aesonOptions $ Just "fetchDeck"

data UpgradeDeckPost = UpgradeDeckPost
  { udpInvestigatorId :: InvestigatorId
  , udpDeckUrl :: Maybe Text
  , udpDeckList :: Maybe ArkhamDBDecklist
  }
  deriving stock (Show, Generic)

instance FromJSON UpgradeDeckPost where
  parseJSON = genericParseJSON $ aesonOptions $ Just "udp"

newtype DeckError = UnimplementedCard CardCode
  deriving stock (Show, Eq, Generic)

instance ToJSON DeckError where
  toJSON = genericToJSON $ defaultOptions {tagSingleConstructors = True}

toDeckErrors :: ArkhamDBDecklist -> [DeckError]
toDeckErrors decklist = flip mapMaybe cardCodes \cardCode ->
  maybe
    (Just $ UnimplementedCard cardCode)
    (const Nothing)
    (Map.lookup cardCode allPlayerCards)
 where
  cardCodes = Map.keys $ slots decklist

postApiV1ArkhamDecksR :: Handler (Entity ArkhamDeck)
postApiV1ArkhamDecksR = do
  userId <- getRequestUserId
  postData <- requireCheckJsonBody
  let deck = fromPostData userId postData
  case toDeckErrors (arkhamDeckList deck) of
    [] -> runDB $ insertEntity deck
    err -> sendStatusJSON status400 err

postApiV1ArkhamDecksValidateR :: Handler ()
postApiV1ArkhamDecksValidateR = do
  _ <- getRequestUserId
  decklist <- requireCheckJsonBody
  case toDeckErrors decklist of
    [] -> sendStatusJSON status200 ()
    err -> sendStatusJSON status400 err

postApiV1ArkhamDecksFetchR :: Handler ArkhamDBDecklist
postApiV1ArkhamDecksFetchR = do
  _ <- getRequestUserId
  FetchDeckPost {..} <- requireCheckJsonBody
  getDeckList fetchDeckUrl >>= \case
    Right decklist -> pure decklist
    Left err -> sendStatusJSON Status.status400 (JSONError $ T.pack err)

putApiV1ArkhamGameDecksR :: ArkhamGameId -> Handler ()
putApiV1ArkhamGameDecksR gameId = do
  userId <- getRequestUserId
  postData <- requireCheckJsonBody
  tracer <- getTracer
  now <- liftIO getCurrentTime
  mUpgradeDecklist <- case udpDeckList postData of
    Just decklist -> pure $ Just decklist
    Nothing -> forM (udpDeckUrl postData) $ getDeckList >=> either (error . show) pure
  ArkhamGame {..} <- runDB $ atomicallyWithGame gameId \ArkhamGame {..} -> do
    mLastStep <- getBy (UniqueStep gameId arkhamGameStep)
    let Game {..} = arkhamGameCurrentData
    let investigatorId = udpInvestigatorId postData
    let currentQueue = maybe [] (choiceMessages . arkhamStepChoice . entityVal) mLastStep

    gameRef <- liftIO $ newIORef arkhamGameCurrentData
    queueRef <- liftIO $ newQueue currentQueue
    genRef <- liftIO $ newIORef $ mkStdGen gameSeed
    runGameApp (GameApp gameRef queueRef genRef (pure . const ()) tracer Nothing) do
      playerId <- getPlayer investigatorId
      let question' = Map.delete (coerce playerId) gameQuestion
      unless (Map.null question') (push $ AskMap question')
      let pushUpgrade decklist =
            push
              $ if investigatorId /= decklist.investigator
                then case Map.lookup (toCardCode decklist.investigator) allInvestigatorCards of
                  Nothing -> ReplaceInvestigator investigatorId decklist
                  Just def -> do
                    if toCardCode investigatorId `elem` def.cardCodes
                      then UpgradeDecklist investigatorId decklist
                      else ReplaceInvestigator investigatorId decklist
                else UpgradeDecklist investigatorId decklist
      for_ mUpgradeDecklist pushUpgrade
      runMessages (gameIdToText gameId) Nothing
    ge <- liftIO $ readIORef gameRef

    let diffDown = diff ge arkhamGameCurrentData
    updatedQueue <- liftIO $ readIORef (queueToRef queueRef)

    let g' =
          ArkhamGame
            arkhamGameName
            ge
            (arkhamGameStep + 1)
            arkhamGameMultiplayerVariant
            arkhamGameCreatedAt
            now

    replace gameId g'
    insert_
      $ ArkhamStep
        gameId
        (Choice diffDown updatedQueue)
        (arkhamGameStep + 1)
        (ActionDiff $ view actionDiffL ge)
    case mUpgradeDecklist of
      Just decklist -> saveCampaignDeck userId gameId arkhamGameName investigatorId decklist
      Nothing -> pure ()
    pure g'

  publishToRoom gameId
    $ GameUpdate
    $ PublicGame gameId arkhamGameName mempty arkhamGameCurrentData

saveCampaignDeck :: UserId -> ArkhamGameId -> Text -> InvestigatorId -> ArkhamDBDecklist -> DB ()
saveCampaignDeck userId gameId gameName investigatorId decklist = do
  existingDecks <- select do
    decks <- from $ table @ArkhamDeck
    where_ $ decks.userId ==. val userId
    pure decks
  let decklist' = setCampaignDeckMeta "active" gameId investigatorId gameName decklist
      name' = campaignDeckName gameName decklist
      investigatorName' = tshow $ investigator_name decklist
  case find (isActiveCampaignDeck gameId investigatorId . arkhamDeckList . entityVal) existingDecks of
    Just (Entity deckId _) ->
      update \d -> do
        set
          d
          [ ArkhamDeckUrl =. val (url decklist')
          , ArkhamDeckName =. val name'
          , ArkhamDeckInvestigatorName =. val investigatorName'
          , ArkhamDeckList =. val decklist'
          ]
        where_ $ d.id ==. val deckId
        where_ $ d.userId ==. val userId
    Nothing ->
      insert_
        ArkhamDeck
          { arkhamDeckUserId = userId
          , arkhamDeckUrl = url decklist'
          , arkhamDeckInvestigatorName = investigatorName'
          , arkhamDeckName = name'
          , arkhamDeckList = decklist'
          }

campaignDeckName :: Text -> ArkhamDBDecklist -> Text
campaignDeckName gameName decklist =
  let baseName = fromMaybe (investigator_name decklist) (decklist_name decklist)
      suffix = "（" <> gameName <> "）"
   in if suffix `T.isSuffixOf` baseName then baseName else baseName <> suffix

isActiveCampaignDeck :: ArkhamGameId -> InvestigatorId -> ArkhamDBDecklist -> Bool
isActiveCampaignDeck gameId investigatorId decklist =
  campaignMetaText "arkham_horror_campaign_status" decklist == Just "active"
    && campaignMetaText "arkham_horror_campaign_game_id" decklist == Just (gameIdToText gameId)
    && campaignMetaText "arkham_horror_campaign_investigator" decklist == Just (unCardCode $ coerce investigatorId)

setCampaignDeckMeta :: Text -> ArkhamGameId -> InvestigatorId -> Text -> ArkhamDBDecklist -> ArkhamDBDecklist
setCampaignDeckMeta status gameId investigatorId gameName decklist =
  decklist
    { meta =
        Just
          $ encodeCampaignMeta
          $ KeyMap.insert "arkham_horror_campaign_status" (Aeson.String status)
          $ KeyMap.insert "arkham_horror_campaign_game_id" (Aeson.String $ gameIdToText gameId)
          $ KeyMap.insert "arkham_horror_campaign_investigator" (Aeson.String $ unCardCode $ coerce investigatorId)
          $ KeyMap.insert "arkham_horror_campaign_label" (Aeson.String gameName)
          $ decodeCampaignMeta decklist
    , decklist_name = Just $ campaignDeckName gameName decklist
    }

campaignMetaText :: Text -> ArkhamDBDecklist -> Maybe Text
campaignMetaText key decklist = do
  Aeson.String value <- KeyMap.lookup (fromString $ T.unpack key) (decodeCampaignMeta decklist)
  pure value

decodeCampaignMeta :: ArkhamDBDecklist -> Aeson.Object
decodeCampaignMeta decklist = fromMaybe mempty do
  raw <- meta decklist
  Aeson.Object value <- Aeson.decode $ BL.fromStrict $ TE.encodeUtf8 raw
  pure value

encodeCampaignMeta :: Aeson.Object -> Text
encodeCampaignMeta = TE.decodeUtf8 . BL.toStrict . Aeson.encode . Aeson.Object

fromPostData :: UserId -> CreateDeckPost -> ArkhamDeck
fromPostData userId CreateDeckPost {..} = do
  ArkhamDeck
    { arkhamDeckUserId = userId
    , arkhamDeckUrl = deckUrl
    , arkhamDeckInvestigatorName = tshow $ investigator_name deckList
    , arkhamDeckName = deckName
    , arkhamDeckList = deckList
    }

arkhamBuildDecklistUrl :: Text -> Maybe Text
arkhamBuildDecklistUrl url = do
  rest <- asum $ map (`T.stripPrefix` url)
    [ "https://arkham.build/decklist/view/"
    , "https://arkham.build/decklist/"
    , "http://arkham.build/decklist/view/"
    , "http://arkham.build/decklist/"
    ]
  let decklistId = T.takeWhile (/= '?') $ T.takeWhile (/= '/') rest
  guard $ not $ T.null decklistId
  pure $ "https://api.arkham.build/v1/public/arkhamdb/decklist/" <> decklistId

decodeDeckList :: BL.ByteString -> Either String ArkhamDBDecklist
decodeDeckList bytes = case eitherDecode bytes of
  Right decklist -> Right decklist
  Left _ -> do
    decklists <- eitherDecode bytes
    maybe (Left "No decklist found") Right (listToMaybe decklists)

getDeckList :: MonadIO m => Text -> m (Either String ArkhamDBDecklist)
getDeckList url = liftIO case arkhamBuildDecklistUrl url of
  Just fetchUrl -> do
    request <- parseRequest $ T.unpack fetchUrl
    manager <- newManager tlsManagerSettings
    let request' = request {requestHeaders = ("X-Client-Id", "arkham-horror") : requestHeaders request}
    second (\d -> d {url = Nothing}) . decodeDeckList . responseBody <$> httpLbs request' manager
  Nothing -> second (\d -> d {url = Just url}) . decodeDeckList <$> simpleHttp (T.unpack url)

getApiV1ArkhamDeckR :: ArkhamDeckId -> Handler (Entity ArkhamDeck)
getApiV1ArkhamDeckR deckId = do
  userId <- getRequestUserId
  mDeck <- runDB $ selectOne do
    decks <- from $ table @ArkhamDeck
    where_ $ decks.id ==. val deckId
    where_ $ decks.userId ==. val userId
    pure decks
  maybe notFound pure mDeck

putApiV1ArkhamDeckR :: ArkhamDeckId -> Handler (Entity ArkhamDeck)
putApiV1ArkhamDeckR deckId = do
  userId <- getRequestUserId
  postData <- requireCheckJsonBody
  let deck = fromPostData userId postData
  case toDeckErrors (arkhamDeckList deck) of
    [] -> do
      mDeck <- runDB $ selectOne do
        decks <- from $ table @ArkhamDeck
        where_ $ decks.id ==. val deckId
        where_ $ decks.userId ==. val userId
        pure decks
      case mDeck of
        Nothing -> notFound
        Just _ -> do
          runDB $ update \d -> do
            set
              d
              [ ArkhamDeckUrl =. val (arkhamDeckUrl deck)
              , ArkhamDeckName =. val (arkhamDeckName deck)
              , ArkhamDeckInvestigatorName =. val (arkhamDeckInvestigatorName deck)
              , ArkhamDeckList =. val (arkhamDeckList deck)
              ]
            where_ $ d.id ==. val deckId
            where_ $ d.userId ==. val userId
          pure $ Entity deckId deck
    err -> sendStatusJSON status400 err

deleteApiV1ArkhamDeckR :: ArkhamDeckId -> Handler ()
deleteApiV1ArkhamDeckR deckId = do
  userId <- getRequestUserId
  runDB $ delete do
    decks <- from $ table @ArkhamDeck
    where_ $ decks.id ==. val deckId
    where_ $ decks.userId ==. val userId

newtype JSONError = JSONError {errorMsg :: Text}
  deriving stock (Show, Eq, Generic)
  deriving anyclass (ToJSON, FromJSON)

postApiV1ArkhamSyncDeckR :: ArkhamDeckId -> Handler (Entity ArkhamDeck)
postApiV1ArkhamSyncDeckR deckId = do
  userId <- getRequestUserId
  deck <- runDB $ get404 deckId
  unless (arkhamDeckUserId deck == userId) do
    sendStatusJSON
      Status.status400
      (JSONError "Deck does not belong to this user")
  edecklist <- maybe (pure $ Left "no deck url") getDeckList (arkhamDeckUrl deck)
  case edecklist of
    Right decklist -> do
      runDB $ update \d -> do
        set d [ArkhamDeckList =. val decklist]
        where_ $ d.id ==. val deckId
      pure $ Entity deckId $ deck {arkhamDeckList = decklist}
    Left _ -> sendStatusJSON Status.status400 (JSONError "Could not sync deck")
