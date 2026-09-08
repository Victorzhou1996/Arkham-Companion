module Arkham.SeptemberRuleFixesSpec (spec) where

import Arkham.Card.CardDef
import Arkham.Story.Cards qualified as Stories
import Test.Hspec
import Prelude

spec :: Spec
spec = describe "September upstream rule fixes" do
  describe "victory on the story side" do
    mapM_
      (\(label, card) -> it label $ cdVictoryPoints card `shouldBe` Just 1)
      [ ("Seafloor Frieze", Stories.seafloorFrieze)
      , ("Eroded Frieze", Stories.erodedFriezeStory)
      , ("A Lost Memento", Stories.aLostMemento)
      , ("Exhume the Bones", Stories.exhumeTheBones)
      , ("Familial Pain", Stories.familialPain)
      , ("Playful Shadows", Stories.playfulShadows)
      , ("Sympathy Pain", Stories.sympathyPain)
      , ("Timorous Shadows", Stories.timorousShadows)
      ]
