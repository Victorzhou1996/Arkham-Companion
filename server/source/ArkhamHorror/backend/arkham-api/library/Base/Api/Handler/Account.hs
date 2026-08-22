module Base.Api.Handler.Account where

import Crypto.BCrypt
import Data.Aeson (withObject)
import Data.Text qualified as T
import Data.Text.Encoding qualified as TE
import Database.Esqueleto.Experimental
import Database.Persist qualified as Persist
import Import hiding (delete, (==.))

data PasswordChange = PasswordChange
  { currentPassword :: Text
  , newPassword :: Text
  }

instance FromJSON PasswordChange where
  parseJSON = withObject "PasswordChange" $ \o ->
    PasswordChange <$> o .: "currentPassword" <*> o .: "newPassword"

deleteApiV1AccountR :: Handler ()
deleteApiV1AccountR = do
  userId <- getRequestUserId
  runDB do
    delete do
      resets <- from $ table @PasswordReset
      where_ $ resets.userId ==. val userId
    deleteKey userId

putApiV1AccountPasswordR :: Handler ()
putApiV1AccountPasswordR = do
  PasswordChange {..} <- requireCheckJsonBody
  when (T.length newPassword < 6) $ invalidArgs ["New password must be at least 6 characters"]
  Entity userId user <- getRequestUser
  unless
    ( validatePassword
        (TE.encodeUtf8 $ userPasswordDigest user)
        (TE.encodeUtf8 currentPassword)
    )
    $ permissionDenied "Current password is incorrect"

  mdigest <-
    liftIO
      $ hashPasswordUsingPolicy
        slowerBcryptHashingPolicy
        (TE.encodeUtf8 newPassword)

  case mdigest of
    Nothing -> error "could not hash password"
    Just digest ->
      runDB $ Persist.update userId [UserPasswordDigest Persist.=. TE.decodeUtf8 digest]
