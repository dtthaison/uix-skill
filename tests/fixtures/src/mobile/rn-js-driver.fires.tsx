import React from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Animated } from 'react-native';
export const go = (v) => Animated.timing(v, { toValue: 1, duration: 200 }).start(); // FIRES
