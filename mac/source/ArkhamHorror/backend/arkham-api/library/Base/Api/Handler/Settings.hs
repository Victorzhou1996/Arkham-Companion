{-# LANGUAGE DuplicateRecordFields #-}

module Base.Api.Handler.Settings where

import Database.Esqueleto.Experimental
import Import hiding (update, (=.), (==.))

data UserSettings = UserSettings
  { beta :: Bool
  , dev :: Maybe Bool
  }
  deriving stock Generic
  deriving anyclass FromJSON

data CurrentUser = CurrentUser
  { username :: Text
  , email :: Text
  , beta :: Bool
  , dev :: Bool
  }
  deriving stock Generic
  deriving anyclass ToJSON

newtype SiteSettings = SiteSettings
  { assetHost :: Maybe Text
  }

instance ToJSON SiteSettings where
  toJSON SiteSettings {assetHost} = object ["assetHost" .= assetHost]

getApiV1SiteSettingsR :: Handler SiteSettings
getApiV1SiteSettingsR = SiteSettings <$> getsApp (appAssetHost . appSettings)

putApiV1SettingsR :: Handler CurrentUser
putApiV1SettingsR = do
  userId <- getRequestUserId
  UserSettings betaSetting devSetting <- requireCheckJsonBody
  runDB do
    update \u -> do
      set u
        $ [UserBeta =. val betaSetting]
        <> maybe [] (\value -> [UserDev =. val value]) devSetting
      where_ $ u.id ==. val userId
    User {..} <- get404 userId
    pure $ CurrentUser userUsername userEmail userBeta userDev
