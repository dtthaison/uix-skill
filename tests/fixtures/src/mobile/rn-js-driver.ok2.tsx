import React from 'react';
import { Animated } from 'react-native';
export const a = (v, cfg) => Animated.timing(v, cfg).start();
export const b = (v, cfg) => Animated.spring(v, { ...cfg, toValue: 1 }).start();
