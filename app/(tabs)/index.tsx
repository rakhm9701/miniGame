import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  SafeAreaView,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

const BOARD_SIZE = width * 0.5;
const BOARD_RADIUS = BOARD_SIZE / 2;
const TOTAL_KNIVES = 8;
const ROTATION_SPEED = 2;
const COLLISION_GAP = 25;

type GameState = 'playing' | 'failed' | 'win';

interface StuckKnifeProps {
  angle: number;
}

interface WaitingKnifeProps {
  onPress: () => void;
  animValue: Animated.Value;
}

// ============ STUCK KNIFE COMPONENT ============
// Positioned at the edge of the log, blade pointing inward
const StuckKnife: React.FC<StuckKnifeProps> = ({ angle }) => {
  const knifeHeight = 90;
  const distanceFromCenter = BOARD_RADIUS + 30; // Knife starts from edge of board

  return (
    <View
      style={[
        styles.stuckKnifeAnchor,
        {
          transform: [{ rotate: `${angle}deg` }],
        },
      ]}
    >
      {/* Knife positioned from center outward */}
      <View style={[styles.stuckKnife, { top: -distanceFromCenter - knifeHeight + 35 }]}>
        {/* Handle End (pommel) - furthest from log */}
        <View style={styles.sHandleEnd} />
        
        {/* Handle */}
        <View style={styles.sHandle}>
          <View style={styles.sHandleStripe} />
          <View style={styles.sHandleStripe} />
          <View style={styles.sHandleStripe} />
        </View>
        
        {/* Guard */}
        <View style={styles.sGuard} />
        
        {/* Blade */}
        <View style={styles.sBlade} />
        
        {/* Blade Tip */}
        <View style={styles.sBladeTip} />
      </View>
    </View>
  );
};

// ============ WAITING KNIFE COMPONENT ============
const WaitingKnife: React.FC<WaitingKnifeProps> = ({ onPress, animValue }) => {
  return (
    <Pressable onPress={onPress} style={styles.waitingArea}>
      <Animated.View
        style={{
          transform: [
            {
              translateY: animValue.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -10],
              }),
            },
          ],
        }}
      >
        {/* Blade Tip - pointing up */}
        <View style={styles.wBladeTip} />
        
        {/* Blade */}
        <View style={styles.wBlade} />
        
        {/* Guard */}
        <View style={styles.wGuard} />
        
        {/* Handle */}
        <View style={styles.wHandle}>
          <View style={styles.wHandleStripe} />
          <View style={styles.wHandleStripe} />
          <View style={styles.wHandleStripe} />
        </View>
        
        {/* Handle End */}
        <View style={styles.wHandleEnd} />
      </Animated.View>
    </Pressable>
  );
};

// ============ WOODEN LOG COMPONENT ============
const WoodenLog: React.FC<{ rotation: number; knives: number[] }> = ({ rotation, knives }) => {
  return (
    <View
      style={[
        styles.logWrapper,
        { transform: [{ rotate: `${rotation}deg` }] },
      ]}
    >
      {/* Log with rings */}
      <View style={styles.logOuter}>
        <View style={styles.logInner}>
          {/* Tree rings */}
          <View style={[styles.treeRing, { width: BOARD_SIZE * 0.8, height: BOARD_SIZE * 0.8 }]} />
          <View style={[styles.treeRing, { width: BOARD_SIZE * 0.6, height: BOARD_SIZE * 0.6 }]} />
          <View style={[styles.treeRing, { width: BOARD_SIZE * 0.4, height: BOARD_SIZE * 0.4 }]} />
          <View style={[styles.treeRing, { width: BOARD_SIZE * 0.2, height: BOARD_SIZE * 0.2 }]} />
          <View style={styles.centerDot} />
        </View>
      </View>

      {/* Stuck knives */}
      {knives.map((knifeAngle, index) => (
        <StuckKnife key={index} angle={knifeAngle} />
      ))}
    </View>
  );
};

// ============ MAIN GAME COMPONENT ============
export default function KnifeHitGame() {
  const [rotation, setRotation] = useState(0);
  const [knives, setKnives] = useState<number[]>([]);
  const [knivesLeft, setKnivesLeft] = useState(TOTAL_KNIVES);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [stage, setStage] = useState(1);
  const [score, setScore] = useState(0);

  const animationFrame = useRef<number | null>(null);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  // Board rotation
  useEffect(() => {
    if (gameState !== 'playing') return;

    const animate = () => {
      setRotation((prev) => (prev + ROTATION_SPEED) % 360);
      animationFrame.current = requestAnimationFrame(animate);
    };

    animationFrame.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [gameState]);

  // Knife pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  const throwKnife = () => {
    if (gameState !== 'playing' || knivesLeft <= 0) return;

    // Calculate angle where knife will stick (bottom = 180°)
    const stickAngle = (180 - rotation + 360) % 360;

    // Check collision with existing knives
    for (const existingAngle of knives) {
      let diff = Math.abs(existingAngle - stickAngle);
      if (diff > 180) diff = 360 - diff;
      
      if (diff < COLLISION_GAP) {
        setGameState('failed');
        return;
      }
    }

    // Add knife
    const newKnives = [...knives, stickAngle];
    setKnives(newKnives);
    setKnivesLeft((prev) => prev - 1);
    setScore((prev) => prev + 10);

    // Check win
    if (newKnives.length === TOTAL_KNIVES) {
      setGameState('win');
      setScore((prev) => prev + 50);
    }
  };

  const restartGame = () => {
    setRotation(0);
    setKnives([]);
    setKnivesLeft(TOTAL_KNIVES);
    setGameState('playing');
    setScore(0);
    setStage(1);
  };

  const nextStage = () => {
    setStage((prev) => prev + 1);
    setRotation(0);
    setKnives([]);
    setKnivesLeft(TOTAL_KNIVES);
    setGameState('playing');
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#1B2838', '#2C3E50', '#1B2838']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.stageText}>Stage {stage}</Text>
          <Text style={styles.scoreText}>{score} 🍎</Text>
        </View>

        {/* Knife indicators */}
        <View style={styles.knifeIndicators}>
          {Array.from({ length: TOTAL_KNIVES }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.indicator,
                i < TOTAL_KNIVES - knivesLeft && styles.indicatorUsed,
              ]}
            />
          ))}
        </View>

        {/* Game Area */}
        <View style={styles.gameArea}>
          <WoodenLog rotation={rotation} knives={knives} />
        </View>

        {/* Waiting Knife */}
        {gameState === 'playing' && (
          <View style={styles.throwSection}>
            <WaitingKnife onPress={throwKnife} animValue={pulseAnim} />
            <Text style={styles.tapText}>TAP TO THROW</Text>
          </View>
        )}

        {/* Game Over Overlay */}
        {gameState === 'failed' && (
          <View style={styles.overlay}>
            <Text style={styles.gameOverText}>💥 GAME OVER</Text>
            <Text style={styles.finalScoreText}>Score: {score}</Text>
            <Pressable style={styles.retryBtn} onPress={restartGame}>
              <Text style={styles.retryBtnText}>🔄 RETRY</Text>
            </Pressable>
          </View>
        )}

        {/* Win Overlay */}
        {gameState === 'win' && (
          <View style={styles.overlay}>
            <Text style={styles.winText}>🎉 STAGE CLEAR!</Text>
            <Text style={styles.finalScoreText}>+50 Bonus</Text>
            <Pressable style={styles.nextBtn} onPress={nextStage}>
              <Text style={styles.nextBtnText}>NEXT STAGE →</Text>
            </Pressable>
          </View>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B2838',
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingTop: 15,
    paddingBottom: 10,
  },
  stageText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scoreText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#F5A623',
  },
  knifeIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginVertical: 15,
  },
  indicator: {
    width: 6,
    height: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
  indicatorUsed: {
    backgroundColor: '#3D4F5F',
  },
  gameArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // ============ LOG STYLES ============
  logWrapper: {
    width: BOARD_SIZE + 200,
    height: BOARD_SIZE + 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logOuter: {
    width: BOARD_SIZE + 12,
    height: BOARD_SIZE + 12,
    borderRadius: (BOARD_SIZE + 12) / 2,
    backgroundColor: '#8B5A2B',
    justifyContent: 'center',
    alignItems: 'center',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
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
  treeRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#C4A06A',
  },
  centerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#A08060',
  },

  // ============ STUCK KNIFE STYLES ============
  stuckKnifeAnchor: {
    position: 'absolute',
    width: 0,
    height: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stuckKnife: {
    position: 'absolute',
    alignItems: 'center',
  },
  sHandleEnd: {
    width: 16,
    height: 12,
    backgroundColor: '#5D4037',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  sHandle: {
    width: 12,
    height: 38,
    backgroundColor: '#8D6E63',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  sHandleStripe: {
    width: 14,
    height: 3,
    backgroundColor: '#5D4037',
    borderRadius: 1,
  },
  sGuard: {
    width: 22,
    height: 6,
    backgroundColor: '#78909C',
    borderRadius: 2,
  },
  sBlade: {
    width: 10,
    height: 35,
    backgroundColor: '#B0BEC5',
    borderWidth: 1,
    borderColor: '#90A4AE',
  },
  sBladeTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#B0BEC5',
  },

  // ============ WAITING KNIFE STYLES ============
  waitingArea: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  wBladeTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#B0BEC5',
  },
  wBlade: {
    width: 14,
    height: 45,
    backgroundColor: '#B0BEC5',
    borderWidth: 1,
    borderColor: '#90A4AE',
  },
  wGuard: {
    width: 28,
    height: 8,
    backgroundColor: '#78909C',
    borderRadius: 2,
  },
  wHandle: {
    width: 14,
    height: 45,
    backgroundColor: '#8D6E63',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  wHandleStripe: {
    width: 16,
    height: 3,
    backgroundColor: '#5D4037',
    borderRadius: 1,
  },
  wHandleEnd: {
    width: 18,
    height: 14,
    backgroundColor: '#5D4037',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },

  throwSection: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  tapText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    letterSpacing: 3,
    marginTop: 15,
  },

  // ============ OVERLAY STYLES ============
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameOverText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FF6B6B',
    marginBottom: 20,
  },
  winText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4ECDC4',
    marginBottom: 20,
  },
  finalScoreText: {
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: 40,
  },
  retryBtn: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 50,
    paddingVertical: 18,
    borderRadius: 30,
  },
  retryBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  nextBtn: {
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 50,
    paddingVertical: 18,
    borderRadius: 30,
  },
  nextBtnText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});