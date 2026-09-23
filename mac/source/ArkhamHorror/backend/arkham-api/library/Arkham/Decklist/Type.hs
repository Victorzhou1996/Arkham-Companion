module Arkham.Decklist.Type where

import Arkham.Card.CardCode
import Arkham.Id
import Arkham.Investigator.Cards
import Arkham.Name
import Arkham.Prelude
import Data.Aeson.Types (typeMismatch)
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as BL
import Data.Text.Encoding qualified as TE
import GHC.Records
import Control.Monad.Fail (fail)

data ArkhamDBDecklist = ArkhamDBDecklist
  { slots :: Map CardCode Int
  , sideSlots :: Map CardCode Int
  , investigator_code :: InvestigatorId
  , investigator_name :: Text
  , meta :: Maybe Text
  , taboo_id :: Maybe Int
  , url :: Maybe Text
  , decklist_id :: Maybe Text
  , decklist_name :: Maybe Text
  }
  deriving stock (Generic, Show, Ord, Eq, Data)

instance ToJSON ArkhamDBDecklist where
  toJSON ArkhamDBDecklist {..} =
    object
      [ "slots" .= slots
      , "sideSlots" .= sideSlots
      , "investigator_code" .= investigator_code
      , "investigator_name" .= investigator_name
      , "meta" .= meta
      , "taboo_id" .= taboo_id
      , "url" .= url
      , "id" .= decklist_id
      , "name" .= decklist_name
      ]

data ArkhamDBDecklistMeta = ArkhamDBDecklistMeta
  { alternate_front :: Maybe InvestigatorId
  , attachments_09077 :: Maybe Text
  , attachments_11080 :: Maybe Text
  }
  deriving stock (Generic, Show)
  deriving anyclass FromJSON

decklistInvestigatorId :: ArkhamDBDecklist -> InvestigatorId
decklistInvestigatorId decklist = fromMaybe (investigator_code decklist) do
  meta' <- meta decklist
  ArkhamDBDecklistMeta {alternate_front} <- decode (encodeUtf8 $ fromStrict meta')
  guard (alternate_front /= Just "") *> alternate_front

instance HasField "investigator" ArkhamDBDecklist InvestigatorId where
  getField = decklistInvestigatorId

instance FromJSON ArkhamDBDecklist where
  parseJSON = withObject "ArkhamDBDecklist" $ \o -> do
    slots <- o .: "slots"
    sideSlots <- o .: "sideSlots" <|> pure mempty
    investigator_code <- o .: "investigator_code"
    investigator_name <-
      o
        .:? "investigator_name"
        .!= maybe
          (error "missing investigator")
          toTitle
          (lookup (coerce investigator_code) allInvestigatorCards)
    rawMeta <- o .:? "meta"
    notes <- o .:? "description_md"
    meta <- case notes of
      Nothing -> pure rawMeta
      Just description -> do
        values <- maybe (pure mempty) (either fail pure . Aeson.eitherDecodeStrict' . TE.encodeUtf8) rawMeta
        pure $ Just $ TE.decodeUtf8 $ BL.toStrict $ Aeson.encode $ KeyMap.insert "arkham_horror_description_md" (String description) values
    taboo_id <- o .:? "taboo_id"
    url <- o .:? "url"
    decklist_id <- o .:? "id" >>= traverse parseDecklistId
    decklist_name <- o .:? "name"
    pure $ ArkhamDBDecklist {..}
   where
    parseDecklistId = \case
      String t -> pure t
      Number n -> pure $ tshow n
      Null -> pure ""
      v -> typeMismatch "Decklist id" v
