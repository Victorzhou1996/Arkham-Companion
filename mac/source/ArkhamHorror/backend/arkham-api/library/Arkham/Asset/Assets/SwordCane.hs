module Arkham.Asset.Assets.SwordCane (swordCane) where

import Arkham.Ability
import Arkham.Asset.Cards qualified as Cards
import Arkham.Asset.Import.Lifted
import Arkham.Evade
import Arkham.Fight
import Arkham.Matcher
import Arkham.Message.Lifted.Choose

newtype SwordCane = SwordCane AssetAttrs
  deriving anyclass (IsAsset, HasModifiersFor)
  deriving newtype (Show, Eq, ToJSON, FromJSON, Entity)

swordCane :: AssetCard SwordCane
swordCane = asset SwordCane Cards.swordCane

instance HasAbilities SwordCane where
  getAbilities (SwordCane x) =
    [ controlled x 1 (any_ [CanEvadeEnemy (x.ability 2), CanFightEnemy (x.ability 2)])
        $ freeReaction
        $ AssetEntersPlay #after (be x)
    , restricted x 1 ControlsThis $ fightAction $ exhaust x
    , restricted x 2 ControlsThis $ evadeAction $ exhaust x
    ]

instance RunMessage SwordCane where
  runMessage msg a@(SwordCane attrs) = runQueueT $ case msg of
    UseCardAbility iid (isSource attrs -> True) 1 windows' payments -> do
      liftRunMessage (UseCardAbility iid (toSource attrs) 2 windows' payments) a
    UseThisAbility iid (isSource attrs -> True) 2 -> do
      let source = attrs.ability 2
      fightableEnemies <- select $ CanFightEnemy source
      evadeableEnemies <- select $ CanEvadeEnemy source

      sid <- getRandom

      chooseOrRunOneM iid do
        unless (null evadeableEnemies) $ labeled "Evade" do
          chooseOneM iid do
            for_ [#willpower, #agility] \sk -> do
              skillLabeled sk $ chooseEvadeEnemyEdit sid iid source (Arkham.Evade.withSkillType sk)
        unless (null fightableEnemies) $ labeled "Fight" do
          chooseOneM iid do
            for_ [#willpower, #combat] \sk -> do
              skillLabeled sk $ chooseFightEnemyEdit sid iid source (Arkham.Fight.withSkillType sk)
      pure a
    _ -> SwordCane <$> liftRunMessage msg attrs
