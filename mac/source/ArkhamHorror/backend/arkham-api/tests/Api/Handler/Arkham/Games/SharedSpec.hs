module Api.Handler.Arkham.Games.SharedSpec (spec) where

import TestImport

import Api.Handler.Arkham.Games.Shared (isRandomOutcomeMessage, retainedStepFloor)
import Arkham.Deck qualified as Deck
import Arkham.Draw.Types (CardDrew (..))
import Arkham.Game.Settings (Settings (settingsUndoMode), UndoMode (..))
import Data.Aeson.Diff (Patch)
import Data.Aeson.Types (Result (..))
import Data.UUID (nil)
import Entity.Arkham.Step (Choice (choiceHasRandomOutcome))

spec :: Spec
spec = do
  describe "undo history retention" do
    it "keeps the full current scenario in standard mode" do
      retainedStepFloor StandardUndo False False 42 `shouldBe` Nothing

    it "turns a finalized standard scenario into a new baseline" do
      retainedStepFloor StandardUndo True False 42 `shouldBe` Just 42

    it "keeps a predecessor for each of the 30 light-mode undos" do
      retainedStepFloor LightUndo False False 42 `shouldBe` Just 12

    it "keeps the current and previous rows for one hardcore undo" do
      retainedStepFloor HardcoreUndo False False 42 `shouldBe` Just 41

    it "makes a hardcore random outcome the new history baseline" do
      retainedStepFloor HardcoreUndo False True 42 `shouldBe` Just 42

    it "keeps no predecessor in expert mode" do
      retainedStepFloor ExpertUndo False False 42 `shouldBe` Just 42

    it "never prunes full mode" do
      retainedStepFloor FullUndo False False 42 `shouldBe` Nothing

  describe "hardcore random outcome metadata" do
    it "marks player card draws and chaos token draws" do
      let iid = "01001"
      let cardDraw = CardDrew (InvestigatorSource iid) (Deck.InvestigatorDeck iid) [] False mempty Nothing
      let chaosToken = ChaosToken (ChaosTokenId nil) Zero Nothing False False
      isRandomOutcomeMessage (DrewCards iid cardDraw) `shouldBe` True
      isRandomOutcomeMessage (DrawChaosToken iid chaosToken) `shouldBe` True

    it "does not mark an unrelated message" do
      isRandomOutcomeMessage Noop `shouldBe` False

  describe "backward-compatible JSON defaults" do
    it "keeps old games on the original full-history behavior" do
      let decoded = eitherDecode "{}" :: Either String Settings
      settingsUndoMode <$> decoded `shouldBe` Right FullUndo

    it "loads old choices as non-random" do
      let oldChoice = object ["choicePatchDown" .= (mempty :: Patch), "choiceMessages" .= ([] :: [Message])]
      let decoded = fromJSON oldChoice :: Result Choice
      choiceHasRandomOutcome <$> decoded `shouldBe` Success False
