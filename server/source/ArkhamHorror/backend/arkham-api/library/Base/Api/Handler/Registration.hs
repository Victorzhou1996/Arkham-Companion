module Base.Api.Handler.Registration where

import Arkham.Decklist
import Crypto.BCrypt
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as BL
import Data.Map.Strict qualified as Map
import Data.Text.Encoding qualified as TE
import Entity.Arkham.Deck
import Import
import Types

registrationToUser :: Registration -> Handler User
registrationToUser Registration {..} = do
  mdigest <-
    liftIO
      $ hashPasswordUsingPolicy
        slowerBcryptHashingPolicy
        (TE.encodeUtf8 registrationPassword)
  case mdigest of
    Nothing -> error "could not hash password"
    Just digest ->
      pure
        $ User
          registrationUsername
          registrationEmail
          (TE.decodeUtf8 digest)
          False
          False
          False

postApiV1RegistrationR :: Handler Token
postApiV1RegistrationR = do
  user <- requireCheckJsonBody >>= registrationToUser
  userId <- runDB do
    userId <- insert user
    insertMany_ $ starterDecks userId
    pure userId
  Token <$> userIdToToken userId

starterDecks :: UserId -> [ArkhamDeck]
starterDecks userId = map toDeck starterDecklists
 where
  toDeck decklist =
    ArkhamDeck
      { arkhamDeckUserId = userId
      , arkhamDeckUrl = url decklist
      , arkhamDeckName = fromMaybe (investigator_name decklist) (decklist_name decklist)
      , arkhamDeckInvestigatorName = investigator_name decklist
      , arkhamDeckList = decklist
      }

starterDecklists :: [ArkhamDBDecklist]
starterDecklists = [trishStarterDeck, markStarterDeck]

trishStarterDeck :: ArkhamDBDecklist
trishStarterDeck =
  ArkhamDBDecklist
    { slots =
        Map.fromList
          [ ("01030", 1)
          , ("01048", 1)
          , ("01090", 2)
          , ("02022", 2)
          , ("03308", 1)
          , ("05116", 1)
          , ("06024", 1)
          , ("06159", 1)
          , ("06197", 2)
          , ("07010", 1)
          , ("07011", 1)
          , ("07028", 2)
          , ("08125", 1)
          , ("09052", 1)
          , ("10048", 2)
          , ("10067", 1)
          , ("12038", 2)
          , ("12039", 2)
          , ("12050", 2)
          , ("60104", 1)
          , ("60215", 2)
          , ("60268", 2)
          , ("60310", 1)
          , ("60370", 2)
          ]
    , sideSlots =
        Map.fromList
          [ ("01695", 1)
          , ("02189", 1)
          , ("02266", 1)
          , ("05320", 1)
          , ("06198", 2)
          , ("08036", 2)
          , ("08050", 2)
          , ("08055", 1)
          , ("08113", 1)
          , ("08114", 1)
          , ("09060", 2)
          , ("12056", 2)
          , ("12095", 1)
          , ("51003", 1)
          , ("60228", 2)
          , ("60275", 2)
          , ("60373", 2)
          ]
    , investigator_code = "07003"
    , investigator_name = "Trish Scarborough"
    , meta = starterDeckMeta mempty trishNotes
    , taboo_id = Just 10
    , url = Just "https://arkham.build/deck/view/qewhl3Do4yFlzop"
    , decklist_id = Just "qewhl3Do4yFlzop"
    , decklist_name = Just "间谍 运转至上 古神级"
    }

markStarterDeck :: ArkhamDBDecklist
markStarterDeck =
  ArkhamDBDecklist
    { slots =
        Map.fromList
          [ ("01020", 1)
          , ("01021", 1)
          , ("01088", 2)
          , ("01091", 2)
          , ("02022", 2)
          , ("02116", 1)
          , ("02147", 1)
          , ("02184", 1)
          , ("03007", 1)
          , ("03008", 1)
          , ("03009", 1)
          , ("04149", 1)
          , ("04150", 1)
          , ("05313", 1)
          , ("06111", 2)
          , ("06197", 2)
          , ("08125", 1)
          , ("09022", 2)
          , ("09121", 1)
          , ("10023", 1)
          , ("12025", 2)
          , ("60110", 1)
          , ("60115", 2)
          , ("60161", 2)
          , ("60165", 1)
          , ("60554", 1)
          ]
    , sideSlots =
        Map.fromList
          [ ("02148", 1)
          , ("03023", 1)
          , ("03264", 1)
          , ("06156", 1)
          , ("06196", 2)
          , ("07261", 1)
          , ("09038", 1)
          , ("10032", 1)
          , ("51001", 1)
          , ("54002", 1)
          , ("60126", 2)
          , ("60176", 2)
          ]
    , investigator_code = "03001"
    , investigator_name = "Mark Harrigan"
    , meta = starterDeckMeta (KeyMap.singleton "cus_09022" "0|0,1|1,4|0,5|2,7|0") markNotes
    , taboo_id = Just 10
    , url = Just "https://arkham.build/deck/view/DYKly6vcYWthFOi"
    , decklist_id = Just "DYKly6vcYWthFOi"
    , decklist_name = Just "马克，运转至上 古神级"
    }

starterDeckMeta :: Aeson.Object -> Text -> Maybe Text
starterDeckMeta values notes =
  Just
    $ TE.decodeUtf8
    $ BL.toStrict
    $ Aeson.encode
    $ Aeson.Object
    $ KeyMap.insert "arkham_horror_description_md" (Aeson.String notes) values

trishNotes :: Text
trishNotes =
  unlines
    [ "有4经验先卖洞察力提升牌效，熟能生巧找2级洞察力1过4，买完以后2经验买一张黑市替换一张刨根问底，再买2级推理。"
    , "大肆借贷买了以后就可以买协同组件了，加入马队和欺骗制度，0费1过4和1费飞行，分别替换捷径和浮士德"
    , "还有经验买超级加倍，2海量研究，1神秘笔记替换超级加倍，2海量研究替换专业的直觉。"
    , "6经验买杀手锏，换掉最后一张神秘笔迹，狐朋狗友按照我发的点。"
    , "狐朋狗友把素描像加入手牌，相当于1费快速抽3，这个时候狐朋狗友可以换构建动机。"
    , "因为有协同组件，资源是远远溢出的，如果还嫌上限不够可以放大镜换一张黑色扇子，常态8动基本上够用了。"
    , "后面如果缺san，替换掉皮夹克，买宝物猎人和珍贵记忆。"
    , "干一天活拿一天钱和街头浪子可以偏后期点。"
    ]

markNotes :: Text
markNotes =
  unlines
    [ "先升级符文斧，点出古代力量，刻铭匠 如果是2循需要先点荣耀"
    , "饮血者弱点用拘留拷住"
    , "升级完符文斧以后再升级大压制，大致命打击"
    , "后面再升级2级安全护卫，原定计划里压吃一堑，最坏的打算，拘留，这样上来哪个弱点都是可以快速解决的，后面附魔武器给符文斧贴"
    ]
