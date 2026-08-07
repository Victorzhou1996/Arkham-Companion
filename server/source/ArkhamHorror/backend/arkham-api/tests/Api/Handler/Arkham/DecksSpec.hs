module Api.Handler.Arkham.DecksSpec (spec) where

import TestImport

import Api.Handler.Arkham.Decks qualified as Decks
import Api.Handler.Arkham.Games.Shared qualified as GamesShared
import Arkham.Decklist
import Arkham.PlayerCard (allPlayerCards)
import Base.Api.Handler.Registration qualified as Registration
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as BL
import Data.Map.Strict qualified as Map
import Data.Text qualified as Text
import Data.Text.Encoding qualified as TE
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

  it "preserves completed campaign trauma in deck metadata" do
    let active = Decks.setCampaignDeckMeta "active" gameId testInvestigatorId "The Gathering" testDecklist
        completed = GamesShared.setCampaignDeckStatus "completed" $ setDecklistTrauma 2 1 active

    decklistTrauma completed `shouldBe` Just (2, 1)
    Decks.campaignMetaText "arkham_horror_campaign_status" completed `shouldBe` Just "completed"

  it "bundles two valid starter decks with notes for new accounts" do
    length Registration.starterDecklists `shouldBe` 2
    for_ Registration.starterDecklists \decklist -> do
      let codes = Map.keys (slots decklist) <> Map.keys (sideSlots decklist)
          notes = do
            raw <- meta decklist
            Aeson.Object values <- Aeson.decode $ BL.fromStrict $ TE.encodeUtf8 raw
            Aeson.String value <- KeyMap.lookup "arkham_horror_description_md" values
            pure value
      filter (`Map.notMember` allPlayerCards) codes `shouldBe` []
      notes `shouldSatisfy` maybe False (not . Text.null)

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
