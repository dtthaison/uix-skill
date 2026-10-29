import Animated, { FadeIn, useReducedMotion, withSpring } from 'react-native-reanimated';
export const A = () => {
  const reduce = useReducedMotion();
  return <Animated.View entering={reduce ? undefined : FadeIn} />;
};
