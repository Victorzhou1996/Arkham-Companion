{-# LANGUAGE TemplateHaskell #-}

module Arkham.Git (
  gitHash,
  GitSha (..),
)
where

import Arkham.Prelude
import Control.Monad (fail)
import Data.Text qualified as T
import Language.Haskell.TH (runIO)
import Language.Haskell.TH.Syntax qualified as TH (lift)
import System.Environment (lookupEnv)
import System.Exit (ExitCode (..))
import System.Process (readProcessWithExitCode)

newtype GitSha = GitSha {unGitSha :: Text}
  deriving newtype (Show, Eq, ToJSON, FromJSON, IsString)

{- | The Git commit hash of HEAD at compile time. Attempts to read the
@GIT_SHA1@ environment variable and otherwise runs @git rev-parse HEAD@.
-}
gitHash :: IsString s => s
gitHash =
  fromString
    $ $( let
          strip = T.unpack . T.strip . T.pack

          gitHashCli :: IO (Maybe String)
          gitHashCli = do
            outcome <- try (readProcessWithExitCode "git" ["rev-parse", "HEAD"] "")
            case outcome of
              Left (_ :: IOException) -> pure Nothing
              Right (exitCode, stdoutData, _stderr) -> case exitCode of
                ExitSuccess -> pure $ Just $ strip stdoutData
                ExitFailure _ -> pure Nothing

          gitHash' :: IO String
          gitHash' = do
            envHash <- lookupEnv "GIT_SHA1"
            cliHash <- gitHashCli
            case fmap strip envHash <|> cliHash of
              Just hash | not (null hash) -> pure hash
              _ -> fail "No git sha found; set GIT_SHA1 when building without a Git checkout"
          in
          runIO gitHash' >>= TH.lift
       )
