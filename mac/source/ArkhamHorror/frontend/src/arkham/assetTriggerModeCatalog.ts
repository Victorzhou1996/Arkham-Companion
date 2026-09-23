// Verified against the matching backend's literal HasAbilities declarations.
// Regenerate candidates with scripts/inspect-trigger-mode-catalog.mjs; do not
// infer indices from printed text, icons, or array positions. Unlisted/dynamic
// abilities continue to use live choices and existing saved settings.
import { normalizeCardCode } from './abilityTriggerModeEligibility'

const assetTriggerModes: Readonly<Record<string, readonly number[]>> = {
  '01012': [1], // heirloomOfHyperborea
  '01017': [1, 2], // physicalTraining
  '01018': [1], // beatCop
  '01021': [1], // guardDog
  '01027': [1], // policeBadge2
  '01033': [1], // drMilanChristopher
  '01034': [1, 2], // hyperawareness
  '01040': [1], // magnifyingGlass1
  '01041': [1], // discOfItzamna2
  '01046': [1], // pickpocketing
  '01049': [1, 2], // hardKnocks
  '01058': [1], // forbiddenKnowledge
  '01062': [1, 2], // arcaneStudies
  '01063': [2], // arcaneInitiate
  '01071': [1], // grotesqueStatue4
  '01073': [1], // scavenging
  '01075': [1], // rabbitsFoot
  '01076': [1], // strayCat
  '01077': [1, 2], // digDeep
  '01082': [1], // aquinnah1
  '02006': [1], // zoeysCross
  '02012': [1], // jimsTrumpet
  '02020': [1], // laboratoryAssistant
  '02029': [1], // ritualCandles
  '02032': [2], // fireAxe
  '02033': [1], // peterSylvestre
  '02035': [1], // peterSylvestre2
  '02106': [1], // brotherXavier1
  '02108': [1], // pathfinder1
  '02116': [1], // smokingPipe
  '02117': [1], // painkillers
  '02149': [1], // artStudent
  '02185': [1, 2], // keenEye3
  '02188': [1], // loneWolf
  '02191': [1, 2], // bloodPact3
  '02193': [1, 2], // scrapper3
  '02230': [1], // luckyDice2
  '02232': [1], // alyssaGraham
  '02269': [1], // jewelOfAureolus3
  '02302': [1], // drWilliamTMaleson
  '02305': [1, 2], // theGoldPocketWatch4
  '02309': [1], // tryAndTryAgain3
  '02310': [1], // theRedGlovedMan5
  '03009': [1], // sophieInLovingMemory
  '03010': [1], // analyticalMind
  '03014': [1], // spiritSpeaker
  '03024': [1], // fieldwork
  '03035': [1], // spiritAthame1
  '03107': [1, 2], // combatTraining1
  '03109': [1, 2], // scientificTheory1
  '03111': [1, 2], // moxie1
  '03112': [1], // davidRenfield
  '03113': [1], // grounded1
  '03115': [1, 2], // plucky1
  '03149': [1], // charlesRossEsq
  '03195': [1], // pickpocketing2
  '03198': [1, 2], // madameLabranche
  '03236': [1], // scrying3
  '03264': [1], // stickToThePlan3
  '03266': [1], // arcaneInsight4
  '03268': [2], // suggestion4
  '03269': [1], // stHubertsKey
  '03271': [2], // arcaneInitiate3
  '03305': [1], // armorOfArdennes5
  '03313': [1], // newspaper2
  '04008': [1], // jakeWilliams
  '04013': [1], // theCodexOfAges
  '04017': [2], // survivalKnife
  '04023': [1], // toothOfEztli
  '04026': [1], // decoratedSkull
  '04035': [1, 2], // yaotl1
  '04037': [1], // backpack
  '04107': [1], // luckyCigaretteCase
  '04108': [1], // fence1
  '04154': [1], // quickStudy2
  '04158': [1], // recallTheFuture2
  '04159': [1], // tryAndTryAgain1
  '04160': [1], // cornered2
  '04196': [1], // lolaSantiago3
  '04197': [1], // oliveMcBride
  '04236': [1], // onYourOwn3
  '04307': [1], // pnakoticManuscripts5
  '05007': [2], // hypnoticTherapy
  '05023': [1], // aceOfSwords1
  '05027': [1], // deathXiii1
  '05028': [1], // wellConnected
  '05031': [1], // theMoonXiii1
  '05035': [1], // fourOfCups1
  '05036': [1], // trackShoes
  '05039': [1], // fiveOfPentacles1
  '05040': [1, 2], // aceOfRods1
  '05151': [1], // aliceLuxley
  '05153': [1], // mrRook
  '05154': [1], // hawkEyeFoldingCamera
  '05159': [1], // drawingThin
  '05188': [1], // scrollOfSecretsSeeker3
  '05189': [1], // scrollOfSecretsMystic3
  '05194': [1], // grislyTotemSeeker3
  '05195': [1], // grislyTotemSurvivor3
  '05233': [1], // investments
  '05274': [1, 2], // agencyBackup5
  '05279': [1], // dayanaEsperence3
  '05283': [1, 2], // annaKaslow4
  '05320': [1], // doubleDouble4
  '06010': [1], // bountyContracts
  '06013': [1], // gateBox
  '06020': [1], // solemnVow
  '06021': [1], // segmentOfOnyx1
  '06022': [1], // pendantOfTheQueen
  '06024': [1], // crystallizerOfDreams
  '06118': [1], // jessicaHyde1
  '06155': [1], // tetsuoMori
  '06159': [1], // dreamEnhancingSerum
  '06162': [1], // gregoryGry
  '06196': [1], // safeguard2
  '06203': [1], // moonstone
  '06236': [1], // dreamDiaryDreamsOfAnExplorer3
  '06237': [1], // dreamDiaryDreamsOfAMadman3
  '06238': [1], // dreamDiaryDreamsOfAChild3
  '06239': [1], // haste2
  '06241': [1], // empowerSelfStamina2
  '06243': [1], // empowerSelfAcuity2
  '06244': [1], // twilaKatherinePrice3
  '06276': [1, 2], // emptyVessel4
  '06277': [1], // wishEater
  '06280': [1], // garroteWire2
  '06281': [1], // delilahORourke3
  '06282': [1], // summonedHound1
  '06323': [1], // spiritualResolve5
  '06324': [1, 2], // abigailForeman4
  '06328': [1, 2], // mindsEye2
  '06329': [1], // shiningTrapezohedron4
  '06330': [1], // nightmareBauble3
  '06332': [1], // scavenging2
  '07006': [1], // guardianAngel
  '07012': [1], // showmanship
  '07019': [1], // riteOfSanctification
  '07021': [1], // cryptographicCipher
  '07027': [1], // obfuscation
  '07029': [1], // swordCane
  '07033': [1], // tokenOfFaith
  '07110': [1], // sacredCovenant2
  '07113': [1], // blasphemousCovenant2
  '07116': [1], // falseCovenant2
  '07122': [1], // ancientCovenant2
  '07152': [1, 2], // keenEye
  '07156': [1], // priestOfTwoFaiths1
  '07158': [1, 2], // bloodPact
  '07190': [1], // blessingOfIsis3
  '07191': [1, 2], // crypticGrimoireTextOfTheElderHerald4
  '07194': [1, 2], // tristanBotleyFixerForHire2
  '07220': [1], // holyRosary2
  '07221': [1], // shieldOfFaith2
  '07223': [1], // guidedByTheUnseen3
  '07262': [1, 2], // nephthysHuntressOfBast4
  '07267': [1], // ikiaqTheCouncilsChosen3
  '07271': [1], // favorOfTheMoon1
  '07272': [1], // favorOfTheSun1
  '07273': [1], // purifyingCorruption4
  '07303': [1, 2], // ancestralKnowledge3
  '07307': [1], // luckyDice3
  '07309': [1, 2], // jacobMorrisonCostGuardCaptain3
  '08002': [1], // mechanicsWrench
  '08012b': [1], // disciplineQuiescenceOfThoughtBroken
  '08017': [1], // shrewdDealings
  '08027': [1], // combatTraining3
  '08032': [1], // jeremiahKirbyArcticArchaeologist
  '08033': [1], // archiveOfConduitsUnidentified
  '08035': [1], // hikingBoots1
  '08040': [1], // scientificTheory3
  '08041': [1], // archiveOfConduitsGatewayToTindalos4
  '08042': [1], // archiveOfConduitsGatewayToAcheron4
  '08043': [1], // archiveOfConduitsGatewayToAldebaran4
  '08045': [1], // prophesiaeProfanaAtlasOfTheUnknowable5
  '08056': [1], // moxie3
  '08062': [1], // closeTheCircle1
  '08067': [2], // astronomicalAtlas3
  '08069': [1], // grounded3
  '08073': [1], // bandages
  '08075': [2], // bangleOfJinxes1
  '08081': [1], // plucky3
  '08126': [1], // heavyFurs
  '08128': [1], // rodOfAnimalism1
  '09016': [1, 2], // darrellsKodak
  '09019': [1], // bonnieWalshLoyalAssistant
  '09032': [1], // bestowResolve2
  '09033': [1], // fieldAgent2
  '09034': [1, 2], // guardDog2
  '09037': [1], // martyrsVambraceRemnantOfTheUnknown3
  '09041': [2, 3, 4, 5], // empiricalHypothesis
  '09043': [1], // dissectionTools
  '09045': [1], // researchNotes
  '09050': [1], // labCoat1
  '09054': [1], // drWilliamTMaleson2
  '09055': [1], // pressPass2
  '09063': [1], // embezzledTreasure
  '09071': [1], // stylishCoat1
  '09072': [1], // chuckFergus2
  '09073': [1], // dirtyFighting2
  '09077': [1, 2], // underworldMarket2
  '09079': [1], // livingInk
  '09089': [1, 2], // bindersJarInterdimensionalPrison1
  '09092': [1], // elleRubashPurifyingPurpose2
  '09099': [1], // pocketMultiTool
  '09102': [1], // idolOfXanatosWatcherBeyondTime
  '09114': [1], // katjaEastbankKeeperOfEsotericLore2
  '09120': [1], // toolBelt
  '09122': [1], // flashlight3
  '09123': [1], // soulSanctification3
  '10005b': [1], // fluxStabilizerActive
  '10013': [1], // bookOfLivingMythsChronicleOfWonders
  '10019': [1], // ancestralToken
  '10021': [2], // katana
  '10022': [1], // ofuda
  '10035': [2], // eyesOfValusiaTheMothersCunning4
  '10036': [2], // bladeOfYothTheFathersIre
  '10039': [1], // evanescentAscensionTheMorningStar
  '10041': [1], // drCharlesWestIiiKnowsHisPurpose
  '10042': [1], // microscope
  '10052': [1], // gabrielCarilloTrustedConfidante1
  '10053': [1], // steadyHanded1
  '10058': [1], // microscope4
  '10059': [1, 2], // ravenousMyconidSentientStrain4
  '10060': [2], // ravenousMyconidCarnivorousStrain4
  '10065': [2], // britishBullDog
  '10077': [2], // britishBullDog2
  '10079': [1, 2], // bewitching3
  '10097': [1], // oliveMcBride2
  '10106': [1], // keeperOfTheKeyCelestialWard
  '10107': [1], // servantOfBrassDaemonaicVassal
  '10109': [1], // peltShipment
  '10117': [1], // hatchet1
  '10120': [2], // fireAxe2
  '10123': [1], // survivalTechnique2
  '10126': [1], // tokenOfFaith3
  '10133': [1], // brokenDiademCrownOfDyingLight5
  '11005': [1], // bookOfVerseUnCommonplaceBook
  '11009': [1], // oculaObscuraEsotericEyepiece
  '11012': [1], // violaCase
  '11020': [1], // theBookOfWarSunTzusLegacy
  '11022': [2], // remingtonModel1858
  '11027': [1], // aliceLuxley2
  '11028': [1, 2], // bulwark2
  '11032': [2], // remingtonModel18584
  '11033': [1, 2], // altonOConnellGhostHunter
  '11034': [1, 2], // artisticInspiration
  '11035': [1], // dialOfAncientsUnidentified
  '11037': [1], // mortarAndPestle
  '11038': [1, 2], // oculusMortuum
  '11039': [1], // uncannySpecimen
  '11043': [1, 2], // misdirection2
  '11046': [1], // dialOfAncientsSignsOfCataclysm4
  '11047': [3], // dialOfAncientsSignsOfAberration4
  '11048': [1], // dialOfAncientsSignsOfRevelation4
  '11049': [1], // antikytheraPropheticTimepiece5
  '11050': [1], // lugerP08
  '11052': [1], // stringAlong
  '11059': [2], // mobConnections2
  '11060': [1, 2], // obscure2
  '11062': [1], // robertCastaigneStillHasYourBack4
  '11065': [1, 2], // bloodOfThothLawIncarnate
  '11066': [2], // breathOfTheSleeper
  '11067': [2], // eyesOfTheDreamer
  '11069': [1], // katarinaSojkamissaryFromUlthar
  '11070': [2], // signOfXelotaphSymbolOfProtection
  '11074': [1], // swordCaneDesignedByTheCouncilOfPolls2
  '11078': [1], // lostArcana3
  '11080': [1], // eldritchBrand5
  '11083': [1], // lawrenceCarlisleSculptingHisDreams
  '11089': [1, 2], // ampleSupplies2
  '11094': [1], // giftOfNodens5
  '11099': [1], // libraryPass1
  '11102': [1], // boundForTheHorizon2
  '11103': [1], // forbiddenSutra2
  '11104': [1], // walterFitzpatrickPlayingBothSides2
  '11108': [1], // captivatingPerformance3
  '11109': [1], // cowlOfSekhmetCloakOfPharaohs3
  '11110': [1], // dakotaGarofaloOnTheHunt3
  '11111': [1], // noseToTheGrindstone3
  '11118': [1], // libraryPass5
  '11120': [1], // onTheirHeels5
  '11121': [1], // sacredOathOathOfLoyalty5
  '11122': [1], // sacredOathOathOfOrder5
  '11123': [1], // sacredOathOathOfWisdom5
  '12008': [1], // covertOpsInTheShadows
  '12018': [1], // loganHastingsBountyHunter
  '12030': [1], // dorothySimmonsStraightAStudent
  '12035': [1, 2], // sharpRhetoric
  '12047': [1, 2], // silverTongue
  '12048': [1], // stickyFingers
  '12054': [1], // stickyFingers2
  '12058': [1], // cloakOfResonance
  '12060': [1], // jimCulverHauntedMusician
  '12063': [1, 2], // spiritualIntuition
  '12068': [1], // maskOfSilenusFaceOfTheVoid1
  '12072': [1], // alekseySaburovAlwaysOnTheMend
  '12074': [1], // huntersInstinct
  '12076': [1, 2], // levelheaded
  '50001': [1, 2], // physicalTraining2
  '50003': [1, 2], // hyperawareness2
  '50005': [1, 2], // hardKnocks2
  '50007': [1, 2], // arcaneStudies2
  '50009': [1, 2], // digDeep2
  '50010': [1], // rabbitsFoot3
  '52001': [2], // thirtyTwoColt2
  '53002': [2], // survivalKnife2
  '53005': [1], // decoratedSkull3
  '53010': [1], // onYourOwn3_Exceptional
  '53011': [1], // backpack2
  '54001': [1], // theStarXvii3
  '54002': [1], // hallowedMirror3
  '54003': [1, 2], // theWorldXxi3
  '54004': [2], // occultLexicon3
  '54005': [1, 2], // knightOfSwords3
  '54007': [1], // theHierophantV3
  '54008': [1], // signMagick3
  '54009': [1, 2], // nineOfRods3
  '54011': [1, 2], // theFool03
  '54012': [1], // moonPendant2
  '60102': [1], // randallCho
  '60105': [1], // boxingGloves
  '60106': [1], // fleshWard
  '60107': [1], // greteWagner
  '60109': [1, 2], // relentless
  '60110': [1], // safeguard
  '60127': [1], // boxingGloves3
  '60128': [1], // greteWagner3
  '60152': [2], // becky2
  '60156': [1], // policeDog
  '60157': [1], // rookieCop
  '60159': [1], // protectiveVest
  '60170': [1], // policeDog1
  '60177': [1], // detectiveSherman3
  '60178': [1, 2], // endurance3
  '60181': [1], // protectiveVest4
  '60202': [1], // vaultOfKnowledge
  '60207': [1], // discOfItzamna
  '60213': [1], // whittonGreene
  '60223': [1], // whittonGreene2
  '60231': [1], // farsight4
  '60233': [1, 2, 3, 4], // theNecronomiconPetrusDeDaciaTranslation5
  '60252': [2], // experimentalPsychology
  '60257': [1], // privatePractice
  '60258': [1], // psychologyStudent
  '60260': [1], // universityArchivist
  '60276': [1], // autopsyReport3
  '60277': [1, 2], // sharpRhetoric3
  '60326': [1], // luckyCigaretteCase3
  '60327': [1], // sharpshooter3
  '60332': [1], // chuckFergus5
  '60357': [1], // centerStage
  '60360': [1], // extravagantRing
  '60380': [1, 2], // silverTongue3
  '60402': [1], // arbiterOfFates
  '60406': [1], // scryingMirror
  '60411': [1], // crystalPendulum
  '60412': [1], // robesOfEndlessNight
  '60421': [1], // grotesqueStatue2
  '60422': [1], // robesOfEndlessNight2
  '60458': [1], // sacrificialDoll
  '60475': [2], // ritualDagger3
  '60476': [1, 2], // spiritualIntuition3
  '60479': [1], // jimCulver4
  '60506': [1], // grimmsFairyTales
  '60508': [1], // grannyOrne
  '60511': [1, 2], // scrapper
  '60527': [1], // grannyOrne3
  '60552': [1], // miguelsKnapsack
  '60555': [1], // danielJameson
  '60556': [1], // huntingDog
  '60573': [1], // canteen2
  '60574': [1], // huntersInstinct2
  '60579': [1, 2], // levelheaded3
  '90002': [1], // daisysToteBagAdvanced
  '90025': [1], // directiveDueDiligence
  '90026': [1], // directiveRedTape
  '90028': [1], // directiveSeekTheTruth
  '90038': [1], // tidalMemento
  '90047': [1], // petesGuitar
  '90050': [1], // jimsTrumpetAdvanced
  '90060': [1, 2], // zoeysCrossAdvanced
  '90082': [1], // theCodexOfAgesAdvanced
  '90085': [2], // jennysTwin45sAdvanced
  '98002': [2], // greenManMedallionHourOfTheHuntress
  '98017': [1], // mollyMaxwell
  '98020': [1], // ruthWestmacottDarkRevelations
}

export function knownAssetTriggerModeIndexes(cardCode: string): readonly number[] {
  return assetTriggerModes[normalizeCardCode(cardCode)] ?? []
}
