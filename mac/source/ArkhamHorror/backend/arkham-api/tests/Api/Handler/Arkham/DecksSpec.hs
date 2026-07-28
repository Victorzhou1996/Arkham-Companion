module Api.Handler.Arkham.DecksSpec (spec) where

import TestImport

import Api.Handler.Arkham.Decks qualified as Decks
import Api.Handler.Arkham.Games.Shared qualified as GamesShared
import Arkham.Decklist
import Data.Map.Strict qualified as Map
import Data.UUID (nil)
import Entity.Arkham.Game

spec :: Spec
spec = describe "campaign deck metadata" do
  it "adds the campaign suffix once" do
    Decks.campaignDeckName "The Gathering" testDecklist `shouldBe` "Roland（The Gathering）"
    Decks.campaignDeckName "The Gathering" (testDecklist {decklist_name = Just "Roland（The Gathering）"})
      `shouldBe` "Roland（The Gathering）"

  it "marks upgraded campaign decks active and later completed" do
    let active = Decks.setCampaignDeckMeta "active" gameId testInvestigatorId "The Gathering" testDecklist
        completed = GamesShared.setCampaignDeckStatus "completed" active

    active.decklist_name `shouldBe` Just "Roland（The Gathering）"
    Decks.campaignMetaText "arkham_horror_campaign_status" active `shouldBe` Just "active"
    Decks.campaignMetaText "arkham_horror_campaign_game_id" active `shouldBe` Just "00000000-0000-0000-0000-000000000000"
    Decks.campaignMetaText "arkham_horror_campaign_investigator" active `shouldBe` Just "01001"
    Decks.campaignMetaText "arkham_horror_campaign_label" active `shouldBe` Just "The Gathering"
    Decks.campaignMetaText "arkham_horror_campaign_status" completed `shouldBe` Just "completed"
    Decks.campaignMetaText "arkham_horror_campaign_game_id" completed `shouldBe` Just "00000000-0000-0000-0000-000000000000"

gameId :: ArkhamGameId
gameId = ArkhamGameKey nil

testInvestigatorId :: InvestigatorId
testInvestigatorId = "01001"

testDecklist :: ArkhamDBDecklist
testDecklist =
  ArkhamDBDecklist
    { slots = Map.singleton "01016" 1
    , sideSlots = mempty
    , investigator_code = "01001"
    , investigator_name = "Roland Banks"
    , meta = Nothing
    , taboo_id = Nothing
    , url = Nothing
    , decklist_id = Nothing
    , decklist_name = Just "Roland"
    }
