import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  SafeAreaView,
  Animated,
  Vibration,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

// ==================== GAME CONFIG ====================
const BOARD_SIZE = width * 0.45;
const BOARD_RADIUS = BOARD_SIZE / 2;
const BASE_KNIVES = 10;
const BASE_APPLES = 10;
const ROTATION_SPEED = 1.5;
const COLLISION_GAP = 18;
const APPLE_GAP = 15;

// ==================== BOSS CONFIG ====================
const BOSSES = [
  { stage: 5, name: '🧀 CHEESE BOSS', color: '#FFD700', bgColor: '#FFA000', knives: 12, apples: 8, speed: 2.0, reward: 200 },
  { stage: 10, name: '🍉 WATERMELON', color: '#4CAF50', bgColor: '#2E7D32', knives: 14, apples: 6, speed: 2.2, reward: 300 },
  { stage: 15, name: '🎂 CAKE BOSS', color: '#E91E63', bgColor: '#C2185B', knives: 15, apples: 5, speed: 2.5, reward: 400 },
  { stage: 20, name: '🍊 ORANGE BOSS', color: '#FF9800', bgColor: '#F57C00', knives: 16, apples: 4, speed: 2.8, reward: 500 },
  { stage: 25, name: '💎 DIAMOND', color: '#00BCD4', bgColor: '#0097A7', knives: 18, apples: 3, speed: 3.0, reward: 1000 },
];

// ==================== DAILY REWARDS ====================
const DAILY_REWARDS = [50, 100, 150, 200, 300, 500, 1000];

// ==================== TYPES ====================
type GameState = 'ready' | 'playing' | 'failed' | 'win' | 'boss_intro';

interface AppleData {
  id: number;
  angle: number;
  visible: boolean;
}

interface BossData {
  stage: number;
  name: string;
  color: string;
  bgColor: string;
  knives: number;
  apples: number;
  speed: number;
  reward: number;
}

// ==================== SOUND MANAGER ====================
class SoundManager {
  sounds: { [key: string]: Audio.Sound } = {};
  loaded: boolean = false;

  async load() {
    if (this.loaded) return;
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Create simple beep sounds using different frequencies
      this.sounds = {
        throw: new Audio.Sound(),
        hit: new Audio.Sound(),
        apple: new Audio.Sound(),
        fail: new Audio.Sound(),
        win: new Audio.Sound(),
        coin: new Audio.Sound(),
      };
      this.loaded = true;
    } catch (e) {
      console.log('Sound load error:', e);
    }
  }

  async play(name: string) {
    // Vibration as fallback for sounds
    try {
      switch (name) {
        case 'throw':
          Vibration.vibrate(10);
          break;
        case 'hit':
          Vibration.vibrate(30);
          break;
        case 'apple':
          Vibration.vibrate([0, 20, 10, 20]);
          break;
        case 'fail':
          Vibration.vibrate(300);
          break;
        case 'win':
          Vibration.vibrate([0, 50, 30, 50, 30, 50]);
          break;
        case 'coin':
          Vibration.vibrate(15);
          break;
      }
    } catch (e) {
      console.log('Sound play error:', e);
    }
  }
}

const soundManager = new SoundManager();

// ==================== STORAGE MANAGER ====================
const StorageKeys = {
  COINS: 'knife_hit_coins',
  HIGH_SCORE: 'knife_hit_high_score',
  LAST_REWARD_DATE: 'knife_hit_last_reward',
  REWARD_DAY: 'knife_hit_reward_day',
  SELECTED_KNIFE: 'knife_hit_selected_knife',
};

const saveData = async (key: string, value: any) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.log('Save error:', e);
  }
};

const loadData = async (key: string, defaultValue: any = null) => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch (e) {
    console.log('Load error:', e);
    return defaultValue;
  }
};

// ==================== COMPONENTS ====================

// Apple Component
const Apple: React.FC<{ angle: number }> = ({ angle }) => (
  <View
    style={[
      styles.appleWrapper,
      { transform: [{ rotate: `${angle}deg` }, { translateY: -(BOARD_RADIUS + 35) }] },
    ]}
  >
    <View style={styles.appleContainer}>
      <View style={styles.appleStem} />
      <View style={styles.appleLeaf} />
      <View style={styles.appleBody}>
        <View style={styles.appleShine} />
      </View>
    </View>
  </View>
);

// Apple Explosion
const AppleExplosion: React.FC<{ angle: number; onComplete: () => void }> = ({ angle, onComplete }) => {
  const anims = useRef(
    Array(6).fill(0).map(() => new Animated.ValueXY({ x: 0, y: 0 }))
  ).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const directions = [
      { x: -30, y: -40 }, { x: 30, y: -40 },
      { x: -40, y: 0 }, { x: 40, y: 0 },
      { x: -25, y: 30 }, { x: 25, y: 30 },
    ];

    Animated.parallel([
      ...anims.map((anim, i) =>
        Animated.timing(anim, { toValue: directions[i], duration: 400, useNativeDriver: true })
      ),
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(onComplete);
  }, []);

  return (
    <View
      style={[
        styles.explosionWrapper,
        { transform: [{ rotate: `${angle}deg` }, { translateY: -(BOARD_RADIUS + 35) }] },
      ]}
    >
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.explosionPiece,
            { opacity, transform: [{ translateX: anim.x }, { translateY: anim.y }] },
          ]}
        />
      ))}
    </View>
  );
};

// Stuck Knife
const StuckKnife: React.FC<{ angle: number; color?: string }> = ({ angle, color = '#6D4C41' }) => (
  <View
    style={[
      styles.knifeWrapper,
      { transform: [{ rotate: `${angle}deg` }, { translateY: -(BOARD_RADIUS + 55) }] },
    ]}
  >
    <View style={styles.knifeContainer}>
      <View style={[styles.kHandleEnd, { backgroundColor: color }]} />
      <View style={[styles.kHandle, { backgroundColor: color }]}>
        <View style={styles.kStripe} />
        <View style={styles.kStripe} />
        <View style={styles.kStripe} />
      </View>
      <View style={styles.kGuard} />
      <View style={styles.kBlade} />
      <View style={styles.kTip} />
    </View>
  </View>
);

// Waiting Knife
const WaitingKnife: React.FC<{ color?: string }> = ({ color = '#6D4C41' }) => (
  <View style={styles.waitingKnife}>
    <View style={styles.wTip} />
    <View style={styles.wBlade} />
    <View style={styles.wGuard} />
    <View style={[styles.wHandle, { backgroundColor: color }]}>
      <View style={styles.wStripe} />
      <View style={styles.wStripe} />
      <View style={styles.wStripe} />
    </View>
    <View style={[styles.wHandleEnd, { backgroundColor: color }]} />
  </View>
);

// Flying Knife
const FlyingKnife: React.FC<{ animY: Animated.Value; color?: string }> = ({ animY, color = '#6D4C41' }) => (
  <Animated.View style={[styles.flyingKnife, { transform: [{ translateY: animY }] }]}>
    <View style={styles.wTip} />
    <View style={styles.wBlade} />
    <View style={styles.wGuard} />
    <View style={[styles.wHandle, { backgroundColor: color }]}>
      <View style={styles.wStripe} />
      <View style={styles.wStripe} />
      <View style={styles.wStripe} />
    </View>
    <View style={[styles.wHandleEnd, { backgroundColor: color }]} />
  </Animated.View>
);

// Coin Animation
const CoinPopup: React.FC<{ amount: number; visible: boolean }> = ({ amount, visible }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.coinPopup,
        {
          opacity: anim,
          transform: [
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) },
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
          ],
        },
      ]}
    >
      <Text style={styles.coinPopupText}>+{amount} 🪙</Text>
    </Animated.View>
  );
};

// Daily Reward Modal
const DailyRewardModal: React.FC<{
  visible: boolean;
  day: number;
  reward: number;
  onClaim: () => void;
}> = ({ visible, day, reward, onClaim }) => (
  <Modal visible={visible} transparent animationType="fade">
    <View style={styles.modalOverlay}>
      <View style={styles.dailyModal}>
        <Text style={styles.dailyTitle}>🎁 DAILY REWARD!</Text>
        <Text style={styles.dailyDay}>Day {day}</Text>
        
        <View style={styles.dailyRewardBox}>
          <Text style={styles.dailyRewardAmount}>{reward}</Text>
          <Text style={styles.dailyRewardCoin}>🪙</Text>
        </View>

        <View style={styles.dailyStreak}>
          {DAILY_REWARDS.map((r, i) => (
            <View key={i} style={[styles.dailyStreakItem, i < day && styles.dailyStreakClaimed]}>
              <Text style={styles.dailyStreakDay}>{i + 1}</Text>
              <Text style={styles.dailyStreakReward}>{r}</Text>
            </View>
          ))}
        </View>

        <Pressable style={styles.dailyClaimBtn} onPress={onClaim}>
          <Text style={styles.dailyClaimText}>CLAIM!</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

// Boss Intro Modal
const BossIntroModal: React.FC<{
  visible: boolean;
  boss: BossData | null;
  onStart: () => void;
}> = ({ visible, boss, onStart }) => {
  if (!boss) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.bossModal, { borderColor: boss.color }]}>
          <Text style={styles.bossWarning}>⚠️ WARNING ⚠️</Text>
          <Text style={[styles.bossName, { color: boss.color }]}>{boss.name}</Text>
          
          <View style={styles.bossStats}>
            <View style={styles.bossStat}>
              <Text style={styles.bossStatLabel}>Knives</Text>
              <Text style={styles.bossStatValue}>{boss.knives}</Text>
            </View>
            <View style={styles.bossStat}>
              <Text style={styles.bossStatLabel}>Speed</Text>
              <Text style={styles.bossStatValue}>{boss.speed}x</Text>
            </View>
            <View style={styles.bossStat}>
              <Text style={styles.bossStatLabel}>Reward</Text>
              <Text style={styles.bossStatValue}>{boss.reward}🪙</Text>
            </View>
          </View>

          <Pressable style={[styles.bossStartBtn, { backgroundColor: boss.color }]} onPress={onStart}>
            <Text style={styles.bossStartText}>FIGHT!</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

// ==================== MAIN GAME ====================
export default function KnifeHitGame() {
  // Game State
  const [rotation, setRotation] = useState(0);
  const [stuckKnives, setStuckKnives] = useState<number[]>([]);
  const [apples, setApples] = useState<AppleData[]>([]);
  const [explosions, setExplosions] = useState<number[]>([]);
  const [knivesLeft, setKnivesLeft] = useState(BASE_KNIVES);
  const [gameState, setGameState] = useState<GameState>('ready');
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);
  const [applesHit, setApplesHit] = useState(0);
  const [isThrowing, setIsThrowing] = useState(false);
  const [hasUsedContinue, setHasUsedContinue] = useState(false);

  // Boss State
  const [currentBoss, setCurrentBoss] = useState<BossData | null>(null);
  const [isBossLevel, setIsBossLevel] = useState(false);

  // Economy State
  const [coins, setCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [showCoinPopup, setShowCoinPopup] = useState(false);
  const [coinPopupAmount, setCoinPopupAmount] = useState(0);

  // Daily Reward State
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [rewardDay, setRewardDay] = useState(1);
  const [dailyRewardAmount, setDailyRewardAmount] = useState(50);

  // Refs
  const frameRef = useRef<number | null>(null);
  const rotationRef = useRef(0);
  const flyAnim = useRef(new Animated.Value(0)).current;

  // Load saved data
  useEffect(() => {
    const loadSavedData = async () => {
      await soundManager.load();
      
      const savedCoins = await loadData(StorageKeys.COINS, 0);
      const savedHighScore = await loadData(StorageKeys.HIGH_SCORE, 0);
      const lastRewardDate = await loadData(StorageKeys.LAST_REWARD_DATE, null);
      const savedRewardDay = await loadData(StorageKeys.REWARD_DAY, 1);

      setCoins(savedCoins);
      setHighScore(savedHighScore);
      setRewardDay(savedRewardDay);

      // Check daily reward
      const today = new Date().toDateString();
      if (lastRewardDate !== today) {
        const reward = DAILY_REWARDS[(savedRewardDay - 1) % DAILY_REWARDS.length];
        setDailyRewardAmount(reward);
        setShowDailyReward(true);
      }
    };

    loadSavedData();
  }, []);

  // Save coins when changed
  useEffect(() => {
    saveData(StorageKeys.COINS, coins);
  }, [coins]);

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      saveData(StorageKeys.HIGH_SCORE, score);
    }
  }, [score, highScore]);

  // Generate apples
  const generateApples = useCallback((count: number) => {
    const arr: AppleData[] = [];
    const offset = Math.random() * (360 / count);
    for (let i = 0; i < count; i++) {
      arr.push({
        id: i,
        angle: (offset + i * (360 / count)) % 360,
        visible: true,
      });
    }
    return arr;
  }, []);

  // Check if boss level
  const getBossForStage = useCallback((stageNum: number): BossData | null => {
    return BOSSES.find(b => b.stage === stageNum) || null;
  }, []);

  // Init game/stage
  const initGame = useCallback((stageNum: number = 1) => {
    const boss = getBossForStage(stageNum);
    
    if (boss) {
      setCurrentBoss(boss);
      setIsBossLevel(true);
      setGameState('boss_intro');
      return;
    }

    setCurrentBoss(null);
    setIsBossLevel(false);
    setApples(generateApples(BASE_APPLES));
    setStuckKnives([]);
    setExplosions([]);
    setKnivesLeft(BASE_KNIVES);
    setApplesHit(0);
    setHasUsedContinue(false);
    setRotation(0);
    rotationRef.current = 0;
    setIsThrowing(false);
    flyAnim.setValue(0);
    setGameState('playing');
  }, [generateApples, getBossForStage]);

  // Start boss level
  const startBossLevel = useCallback(() => {
    if (!currentBoss) return;

    setApples(generateApples(currentBoss.apples));
    setStuckKnives([]);
    setExplosions([]);
    setKnivesLeft(currentBoss.knives);
    setApplesHit(0);
    setHasUsedContinue(false);
    setRotation(0);
    rotationRef.current = 0;
    setIsThrowing(false);
    flyAnim.setValue(0);
    setGameState('playing');
  }, [currentBoss, generateApples]);

  // Rotation loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    const baseSpeed = isBossLevel && currentBoss ? currentBoss.speed : ROTATION_SPEED;
    const speed = baseSpeed + (stage - 1) * 0.1;

    const loop = () => {
      rotationRef.current = (rotationRef.current + speed) % 360;
      setRotation(rotationRef.current);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [gameState, stage, isBossLevel, currentBoss]);

  // Show coin popup
  const showCoinGain = useCallback((amount: number) => {
    setCoinPopupAmount(amount);
    setShowCoinPopup(true);
    soundManager.play('coin');
    setTimeout(() => setShowCoinPopup(false), 600);
  }, []);

  // Throw knife
  const throwKnife = useCallback(() => {
    if (gameState !== 'playing' || knivesLeft <= 0 || isThrowing) return;

    setIsThrowing(true);
    flyAnim.setValue(0);
    soundManager.play('throw');

    const hitAngle = (180 - rotationRef.current + 360) % 360;

    Animated.timing(flyAnim, {
      toValue: -height * 0.35,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      // Check knife collision
      for (const kAngle of stuckKnives) {
        let diff = Math.abs(kAngle - hitAngle);
        if (diff > 180) diff = 360 - diff;
        if (diff < COLLISION_GAP) {
          soundManager.play('fail');
          setGameState('failed');
          setIsThrowing(false);
          return;
        }
      }

      soundManager.play('hit');

      // Check apple hit
      let appleHitCount = 0;
      const newApples = apples.map((apple) => {
        if (!apple.visible) return apple;
        let diff = Math.abs(apple.angle - hitAngle);
        if (diff > 180) diff = 360 - diff;
        if (diff < APPLE_GAP) {
          appleHitCount++;
          setExplosions((e) => [...e, apple.angle]);
          return { ...apple, visible: false };
        }
        return apple;
      });

      if (appleHitCount > 0) {
        soundManager.play('apple');
        setApples(newApples);
        setScore((s) => s + 5 * appleHitCount);
        setApplesHit((a) => a + appleHitCount);
        showCoinGain(5 * appleHitCount);
        setCoins((c) => c + 5 * appleHitCount);
      }

      // Add stuck knife
      const newKnives = [...stuckKnives, hitAngle];
      setStuckKnives(newKnives);
      setKnivesLeft((k) => k - 1);
      setScore((s) => s + 10);

      // Check win
      const totalKnives = isBossLevel && currentBoss ? currentBoss.knives : BASE_KNIVES;
      if (newKnives.length >= totalKnives) {
        setTimeout(() => {
          soundManager.play('win');
          
          // Calculate rewards
          let stageReward = 50;
          if (isBossLevel && currentBoss) {
            stageReward = currentBoss.reward;
          }
          
          setScore((s) => s + stageReward);
          setCoins((c) => c + stageReward);
          showCoinGain(stageReward);
          setGameState('win');
        }, 100);
      }

      setIsThrowing(false);
      flyAnim.setValue(0);
    });
  }, [gameState, knivesLeft, isThrowing, stuckKnives, apples, flyAnim, isBossLevel, currentBoss, showCoinGain]);

  // Remove explosion
  const removeExplosion = useCallback((angle: number) => {
    setExplosions((e) => e.filter((a) => a !== angle));
  }, []);

  // Claim daily reward
  const claimDailyReward = useCallback(() => {
    setCoins((c) => c + dailyRewardAmount);
    showCoinGain(dailyRewardAmount);
    
    const newDay = (rewardDay % DAILY_REWARDS.length) + 1;
    setRewardDay(newDay);
    
    saveData(StorageKeys.LAST_REWARD_DATE, new Date().toDateString());
    saveData(StorageKeys.REWARD_DAY, newDay);
    
    setShowDailyReward(false);
  }, [dailyRewardAmount, rewardDay, showCoinGain]);

  // Watch ad to continue
  const watchAdContinue = () => {
    console.log('📺 AD: Continue');
    setHasUsedContinue(true);
    setKnivesLeft(3);
    setGameState('playing');
  };

  // Watch ad for double
  const watchAdDouble = () => {
    console.log('📺 AD: Double');
    const bonus = isBossLevel && currentBoss ? currentBoss.reward : 50;
    setCoins((c) => c + bonus);
    showCoinGain(bonus);
    nextStage();
  };

  // Restart game
  const restartGame = () => {
    setScore(0);
    setStage(1);
    setIsBossLevel(false);
    setCurrentBoss(null);
    initGame(1);
  };

  // Next stage
  const nextStage = () => {
    const newStage = stage + 1;
    setStage(newStage);
    initGame(newStage);
  };

  // Get log colors
  const logColor = isBossLevel && currentBoss ? currentBoss.color : '#DEB887';
  const logBorderColor = isBossLevel && currentBoss ? currentBoss.bgColor : '#8B5A2B';

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f0f1a']} style={styles.gradient}>
        
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.stageText}>
              {isBossLevel ? '👑 BOSS' : `Stage ${stage}`}
            </Text>
            {isBossLevel && currentBoss && (
              <Text style={[styles.bossLevelName, { color: currentBoss.color }]}>
                {currentBoss.name}
              </Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <View style={styles.coinDisplay}>
              <Text style={styles.coinText}>{coins} 🪙</Text>
            </View>
            <Text style={styles.scoreNum}>{score}</Text>
            <Text style={styles.appleCount}>🍎 {applesHit}/{isBossLevel && currentBoss ? currentBoss.apples : BASE_APPLES}</Text>
          </View>
        </View>

        {/* Knife indicators */}
        <View style={styles.indicators}>
          {Array.from({ length: isBossLevel && currentBoss ? currentBoss.knives : BASE_KNIVES }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.ind,
                i < (isBossLevel && currentBoss ? currentBoss.knives : BASE_KNIVES) - knivesLeft && styles.indUsed,
              ]}
            />
          ))}
        </View>

        {/* Game area */}
        <View style={styles.gameArea}>
          <View
            style={[
              styles.boardContainer,
              { transform: [{ rotate: `${rotation}deg` }] },
            ]}
          >
            {/* Log */}
            <View style={[styles.logOuter, { backgroundColor: logBorderColor }]}>
              <View style={[styles.logInner, { backgroundColor: logColor }]}>
                <View style={[styles.ring, { width: '85%', height: '85%' }]} />
                <View style={[styles.ring, { width: '65%', height: '65%' }]} />
                <View style={[styles.ring, { width: '45%', height: '45%' }]} />
                <View style={[styles.ring, { width: '25%', height: '25%' }]} />
                <View style={styles.center} />
              </View>
            </View>

            {/* Apples */}
            {apples.map((apple) =>
              apple.visible ? <Apple key={apple.id} angle={apple.angle} /> : null
            )}

            {/* Explosions */}
            {explosions.map((angle, i) => (
              <AppleExplosion
                key={`exp-${angle}-${i}`}
                angle={angle}
                onComplete={() => removeExplosion(angle)}
              />
            ))}

            {/* Stuck knives */}
            {stuckKnives.map((angle, i) => (
              <StuckKnife key={i} angle={angle} />
            ))}
          </View>

          <CoinPopup amount={coinPopupAmount} visible={showCoinPopup} />
        </View>

        {/* Throw area */}
        <Pressable
          style={styles.throwArea}
          onPress={throwKnife}
          disabled={gameState !== 'playing'}
        >
          {isThrowing && <FlyingKnife animY={flyAnim} />}
          {gameState === 'playing' && knivesLeft > 0 && !isThrowing && <WaitingKnife />}
          {gameState === 'playing' && (
            <Text style={styles.tapText}>TAP ANYWHERE TO THROW</Text>
          )}
        </Pressable>

        {/* ===== MODALS ===== */}

        {/* Daily Reward */}
        <DailyRewardModal
          visible={showDailyReward}
          day={rewardDay}
          reward={dailyRewardAmount}
          onClaim={claimDailyReward}
        />

        {/* Boss Intro */}
        <BossIntroModal
          visible={gameState === 'boss_intro'}
          boss={currentBoss}
          onStart={startBossLevel}
        />

        {/* Ready Screen */}
        {gameState === 'ready' && (
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <Text style={styles.bigEmoji}>🔪</Text>
              <Text style={styles.title}>KNIFE HIT</Text>
              
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{highScore}</Text>
                  <Text style={styles.statLabel}>Best</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{coins}</Text>
                  <Text style={styles.statLabel}>Coins</Text>
                </View>
              </View>

              <Text style={styles.sub}>🍎 Hit apples for coins!</Text>
              <Text style={styles.sub}>👑 Boss every 5 stages!</Text>
              
              <Pressable style={styles.btnGreen} onPress={() => initGame(1)}>
                <Text style={styles.btnText}>▶ PLAY</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Failed Screen */}
        {gameState === 'failed' && (
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <Text style={styles.bigEmoji}>💥</Text>
              <Text style={styles.titleFail}>GAME OVER</Text>
              <Text style={styles.scoreResult}>Score: {score}</Text>
              <Text style={styles.appleResult}>🍎 {applesHit} | 🪙 +{applesHit * 5}</Text>

              {!hasUsedContinue && (
                <Pressable style={styles.btnOrange} onPress={watchAdContinue}>
                  <Text style={styles.btnIcon}>📺</Text>
                  <View>
                    <Text style={styles.btnMainText}>Watch Ad to Continue</Text>
                    <Text style={styles.btnSubText}>+3 knives</Text>
                  </View>
                </Pressable>
              )}

              <Pressable style={styles.btnRed} onPress={restartGame}>
                <Text style={styles.btnText}>🔄 RESTART</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Win Screen */}
        {gameState === 'win' && (
          <View style={styles.overlay}>
            <View style={styles.modal}>
              <Text style={styles.bigEmoji}>{isBossLevel ? '👑' : '🎉'}</Text>
              <Text style={styles.titleWin}>
                {isBossLevel ? 'BOSS DEFEATED!' : 'STAGE CLEAR!'}
              </Text>
              <Text style={styles.scoreResult}>Score: {score}</Text>
              <Text style={styles.appleResult}>🍎 {applesHit}</Text>
              <Text style={styles.bonus}>
                +{isBossLevel && currentBoss ? currentBoss.reward : 50} 🪙
              </Text>

              <Pressable style={styles.btnPurple} onPress={watchAdDouble}>
                <Text style={styles.btnIcon}>📺</Text>
                <View>
                  <Text style={styles.btnMainText}>Watch Ad for 2x Coins</Text>
                  <Text style={styles.btnSubText}>
                    +{isBossLevel && currentBoss ? currentBoss.reward : 50} extra!
                  </Text>
                </View>
              </Pressable>

              <Pressable style={styles.btnCyan} onPress={nextStage}>
                <Text style={styles.btnText}>
                  {isBossLevel ? 'CONTINUE →' : 'NEXT STAGE →'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

      </LinearGradient>
    </SafeAreaView>
  );
}

// ==================== STYLES ====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1a1a2e' },
  gradient: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  stageText: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  bossLevelName: { fontSize: 12, fontWeight: 'bold', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  coinDisplay: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 15,
    marginBottom: 5,
  },
  coinText: { fontSize: 16, fontWeight: 'bold', color: '#FFD700' },
  scoreNum: { fontSize: 24, fontWeight: 'bold', color: '#FFD700' },
  appleCount: { fontSize: 14, color: '#FF6B6B' },

  // Indicators
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 3,
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  ind: { width: 4, height: 18, backgroundColor: '#fff', borderRadius: 2 },
  indUsed: { backgroundColor: '#333' },

  // Game area
  gameArea: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  boardContainer: {
    width: BOARD_SIZE + 140,
    height: BOARD_SIZE + 140,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Log
  logOuter: {
    width: BOARD_SIZE + 10,
    height: BOARD_SIZE + 10,
    borderRadius: (BOARD_SIZE + 10) / 2,
    backgroundColor: '#8B5A2B',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
  },
  logInner: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    borderRadius: BOARD_SIZE / 2,
    backgroundColor: '#DEB887',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
  },
  center: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.2)' },

  // Apple
  appleWrapper: { position: 'absolute', alignItems: 'center' },
  appleContainer: { alignItems: 'center' },
  appleStem: { width: 3, height: 6, backgroundColor: '#5D4037', marginBottom: -2 },
  appleLeaf: {
    position: 'absolute',
    top: 0,
    right: -8,
    width: 10,
    height: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 5,
    transform: [{ rotate: '30deg' }],
  },
  appleBody: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E53935', elevation: 3 },
  appleShine: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },

  // Explosion
  explosionWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
  },
  explosionPiece: {
    position: 'absolute',
    width: 10,
    height: 10,
    backgroundColor: '#E53935',
    borderRadius: 3,
  },

  // Knife
  knifeWrapper: { position: 'absolute', alignItems: 'center' },
  knifeContainer: { alignItems: 'center' },
  kHandleEnd: {
    width: 14,
    height: 10,
    backgroundColor: '#3E2723',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  kHandle: {
    width: 10,
    height: 30,
    backgroundColor: '#6D4C41',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  kStripe: { width: 12, height: 2, backgroundColor: '#3E2723' },
  kGuard: { width: 18, height: 5, backgroundColor: '#78909C', borderRadius: 1 },
  kBlade: { width: 8, height: 26, backgroundColor: '#CFD8DC', borderWidth: 1, borderColor: '#90A4AE' },
  kTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#CFD8DC',
  },

  // Throw area
  throwArea: {
    height: height * 0.2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 15,
  },
  tapText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, letterSpacing: 2, marginTop: 15 },

  // Waiting knife
  waitingKnife: { alignItems: 'center' },
  wTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#CFD8DC',
  },
  wBlade: { width: 14, height: 42, backgroundColor: '#CFD8DC', borderWidth: 1, borderColor: '#90A4AE' },
  wGuard: { width: 24, height: 7, backgroundColor: '#78909C', borderRadius: 2 },
  wHandle: {
    width: 12,
    height: 38,
    backgroundColor: '#6D4C41',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  wStripe: { width: 14, height: 2, backgroundColor: '#3E2723' },
  wHandleEnd: { width: 16, height: 12, backgroundColor: '#3E2723', borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  flyingKnife: { position: 'absolute', top: 15, alignItems: 'center' },

  // Coin popup
  coinPopup: { position: 'absolute' },
  coinPopupText: { fontSize: 28, fontWeight: 'bold', color: '#FFD700' },

  // Overlay & Modal
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1e1e3f',
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    width: width * 0.85,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigEmoji: { fontSize: 50, marginBottom: 10 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  titleFail: { fontSize: 28, fontWeight: 'bold', color: '#FF6B6B', marginBottom: 10 },
  titleWin: { fontSize: 28, fontWeight: 'bold', color: '#4ECDC4', marginBottom: 10 },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 5 },
  scoreResult: { fontSize: 22, color: '#FFD700', marginTop: 10 },
  appleResult: { fontSize: 16, color: '#fff', marginBottom: 5 },
  bonus: { fontSize: 18, color: '#4CAF50', marginBottom: 15 },

  statsRow: { flexDirection: 'row', gap: 20, marginVertical: 15 },
  statBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 15, borderRadius: 10, minWidth: 80 },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#FFD700' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // Buttons
  btnGreen: { backgroundColor: '#4CAF50', paddingHorizontal: 50, paddingVertical: 14, borderRadius: 25, marginTop: 15 },
  btnRed: { backgroundColor: '#FF6B6B', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  btnCyan: { backgroundColor: '#4ECDC4', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 },
  btnOrange: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  btnPurple: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  btnText: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  btnIcon: { fontSize: 24, marginRight: 12 },
  btnMainText: { fontSize: 15, fontWeight: 'bold', color: '#fff' },
  btnSubText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  // Daily Reward Modal
  dailyModal: {
    backgroundColor: '#1e1e3f',
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    width: width * 0.85,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  dailyTitle: { fontSize: 28, fontWeight: 'bold', color: '#FFD700', marginBottom: 5 },
  dailyDay: { fontSize: 18, color: '#fff', marginBottom: 15 },
  dailyRewardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 15,
    marginBottom: 20,
  },
  dailyRewardAmount: { fontSize: 40, fontWeight: 'bold', color: '#FFD700' },
  dailyRewardCoin: { fontSize: 36, marginLeft: 10 },
  dailyStreak: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 20 },
  dailyStreakItem: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 8,
    borderRadius: 8,
    minWidth: 40,
  },
  dailyStreakClaimed: { backgroundColor: 'rgba(76,175,80,0.3)' },
  dailyStreakDay: { fontSize: 10, color: 'rgba(255,255,255,0.6)' },
  dailyStreakReward: { fontSize: 12, fontWeight: 'bold', color: '#FFD700' },
  dailyClaimBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 50, paddingVertical: 14, borderRadius: 25 },
  dailyClaimText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

  // Boss Modal
  bossModal: {
    backgroundColor: '#1e1e3f',
    padding: 25,
    borderRadius: 20,
    alignItems: 'center',
    width: width * 0.85,
    borderWidth: 3,
  },
  bossWarning: { fontSize: 20, color: '#FF5722', marginBottom: 10 },
  bossName: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  bossStats: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  bossStat: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 12,
    borderRadius: 10,
    minWidth: 70,
  },
  bossStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  bossStatValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  bossStartBtn: { paddingHorizontal: 50, paddingVertical: 14, borderRadius: 25 },
  bossStartText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
});