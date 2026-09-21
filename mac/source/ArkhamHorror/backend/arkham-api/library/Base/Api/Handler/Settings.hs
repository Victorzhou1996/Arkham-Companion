{-# LANGUAGE DuplicateRecordFields #-}

module Base.Api.Handler.Settings where

import Database.Esqueleto.Experimental hiding (isNothing)
import Import hiding (update, (=.), (==.))

data UserSettings = UserSettings
  { beta :: Maybe Bool
  , dev :: Maybe Bool
  , phaseTransitionNotifications :: Maybe Bool
  }
  deriving stock Generic
  deriving anyclass FromJSON

data CurrentUser = CurrentUser
  { username :: Text
  , email :: Text
  , beta :: Bool
  , dev :: Bool
  , phaseTransitionNotifications :: Bool
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
  UserSettings betaSetting devSetting phaseSetting <- requireCheckJsonBody
  runDB do
    unless (all isNothing [betaSetting, devSetting, phaseSetting]) $ update \u -> do
      set u
        $ maybe [] (\value -> [UserBeta =. val value]) betaSetting
        <> maybe [] (\value -> [UserDev =. val value]) devSetting
        <> maybe [] (\value -> [UserPhaseTransitionNotifications =. val value]) phaseSetting
      where_ $ u.id ==. val userId
    User {..} <- get404 userId
    pure $ CurrentUser userUsername userEmail userBeta userDev userPhaseTransitionNotifications
