module Arkham.Investigator.RunnerSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Investigator.Runner (getWindowSkippable)
import Arkham.Window qualified as Window
import TestImport

spec :: Spec
spec = describe "response window skipping" do
  it "ignores another investigator's PlayCard window" . gameTest $ \self -> do
    card <- genPlayerCard Assets.flashlight
    attrs <- toAttrs <$> getInvestigator (toId self)
    let window = Window.mkWhen $ Window.PlayCard "01002" (Window.CardPlay (PlayerCard card) True)
    result <- getWindowSkippable attrs [window] window
    liftIO $ result `shouldBe` True
