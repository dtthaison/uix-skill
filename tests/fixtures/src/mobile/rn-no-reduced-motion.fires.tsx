import Animated, { FadeIn, withSpring } from 'react-native-reanimated';
export const A = () => <Animated.View entering={FadeIn} />; // FIRES
export const b = () => withSpring(1);
