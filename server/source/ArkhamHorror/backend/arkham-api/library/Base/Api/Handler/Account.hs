module Base.Api.Handler.Account where

import Crypto.BCrypt
import Data.Text qualified as T
import Data.Text.Encoding qualified as TE
import Database.Esqueleto.Experimental
import Database.Persist qualified as Persist
import Import hiding (delete, (==.))

data ChangePassword = ChangePassword
  { currentPassword :: Text
  , newPassword :: Text
  }
  deriving stock (Show, Generic)
  deriving anyclass FromJSON

putApiV1AccountR :: Handler ()
putApiV1AccountR = do
  ChangePassword {..} <- requireCheckJsonBody
  Entity userId user <- getRequestUser
  unless
    ( validatePassword
        (TE.encodeUtf8 $ userPasswordDigest user)
        (TE.encodeUtf8 currentPassword)
    )
    $ invalidArgs ["The current password is incorrect"]
  when (T.length newPassword < 6) $ invalidArgs ["The new password must contain at least 6 characters"]
  mdigest <-
    liftIO
      $ hashPasswordUsingPolicy
        slowerBcryptHashingPolicy
        (TE.encodeUtf8 newPassword)
  case mdigest of
    Nothing -> invalidArgs ["Could not update the password"]
    Just digest -> runDB $ Persist.update userId [UserPasswordDigest Persist.=. TE.decodeUtf8 digest]

deleteApiV1AccountR :: Handler ()
deleteApiV1AccountR = do
  userId <- getRequestUserId
  runDB do
    delete do
      resets <- from $ table @PasswordReset
      where_ $ resets.userId ==. val userId
    deleteKey userId
