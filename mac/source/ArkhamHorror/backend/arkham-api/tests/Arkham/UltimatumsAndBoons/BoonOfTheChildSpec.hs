module Arkham.UltimatumsAndBoons.BoonOfTheChildSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Event.Cards qualified as Events
import Arkham.Investigator.Cards qualified as Investigators
import Helpers.UltimatumsAndBoons
import TestImport.New

spec :: Spec
spec = describe "Boon of the Child" $ do
  it "once per round you may play the topmost event of your discard, bottom-decking it" . gameTest $ \self -> do
    withUltimatumsAndBoons [BoonOfTheChild]
    eventA <- genPlayerCardWith Events.emergencyCache (setPlayerCardOwner (toId self))
    eventB <- genPlayerCardWith Events.emergencyCache (setPlayerCardOwner (toId self))
    withProp @"discard" [eventA, eventB] self
    withDeck self [Assets.flashlight]

    duringRound do
      asDefs self.playableCards `shouldReturn` [Events.emergencyCache]
      self `playCard` toCard eventA
      self.resources `shouldReturn` 3
      -- it goes to the bottom of the deck instead of the discard pile
      asDefs self.discard `shouldReturn` [Events.emergencyCache]
      asDefs self.deck `shouldReturn` [Assets.flashlight, Events.emergencyCache]
      -- and the permission is spent for the rest of the round
      getModifiers GameTarget `shouldContainM` [MetaModifier "usedBoonOfTheChild"]
      asDefs self.playableCards `shouldReturn` []

    duringRound do
      -- the permission returns next round
      getModifiers GameTarget `shouldNotContainM` [MetaModifier "usedBoonOfTheChild"]
      asDefs self.playableCards `shouldReturn` [Events.emergencyCache]

  it "shares the once-per-round permission across investigators" . gameTest $ \self -> do
    other <- addInvestigator Investigators.rolandBanks
    withUltimatumsAndBoons [BoonOfTheChild]
    eventA <- genPlayerCardWith Events.emergencyCache (setPlayerCardOwner (toId self))
    eventB <- genPlayerCardWith Events.emergencyCache (setPlayerCardOwner (toId other))
    withProp @"discard" [eventA] self
    withProp @"discard" [eventB] other
    withDeck self [Assets.flashlight]
    withDeck other [Assets.flashlight]
    let permission = CanPlayTopmostOfDiscard (Just EventType, [])

    duringRound do
      getModifiers other `shouldContainM` [permission]
      self `playCard` toCard eventA
      getModifiers GameTarget `shouldContainM` [MetaModifier "usedBoonOfTheChild"]
      getModifiers other `shouldNotContainM` [permission]
      asDefs other.discard `shouldReturn` [Events.emergencyCache]

    duringRound do
      getModifiers GameTarget `shouldNotContainM` [MetaModifier "usedBoonOfTheChild"]
      getModifiers other `shouldContainM` [permission]
