module Arkham.CardSettingsSpec (spec) where

import Arkham.Card.Settings
import Data.Aeson (Result (..))
import Data.Map.Strict qualified as Map
import TestImport

spec :: Spec
spec = describe "Card settings" do
  it "defaults ability modes for legacy saves" do
    let
      legacy =
        object
          [ "cardIgnoreUnrelatedSkillTestTriggers" .= False
          , "cardIgnoreDuringSkillTests" .= False
          , "cardAttachments" .= ([] :: [Text])
          ]
    case fromJSON @PerCardSettings legacy of
      Error err -> fail $ "Could not parse legacy card settings: " <> err
      Success decoded -> cardAbilityModes decoded `shouldBe` mempty

  it "round-trips per-ability trigger modes" do
    let
      settings =
        defaultPerCardSettings
          { cardAbilityModes =
              Map.fromList
                [ (1, AbilityOwnerOnly)
                , (2, AbilityAutoSkip)
                ]
          }
    eitherDecode' (encode settings) `shouldBe` Right settings

  it "decodes the frontend update message" do
    let
      payload =
        object
          [ "tag" .= ("CardAbilityModes" :: Text)
          , "value"
              .= object
                [ "1" .= AbilityAlwaysAsk
                , "3" .= AbilityAutoSkip
                ]
          ]
    fromJSON @SetCardSetting payload
      `shouldBe` Success
        ( SetCardSetting
            CardAbilityModes
            (Map.fromList [(1, AbilityAlwaysAsk), (3, AbilityAutoSkip)])
        )
