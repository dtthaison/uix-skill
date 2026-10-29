import React from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Animated } from 'react-native';
export const A = () => <Pressable onPress={go} style={({ pressed }) => ({ width: 32, height: 32, opacity: pressed ? 0.7 : 1 })}><Text>Go</Text></Pressable>; // FIRES
