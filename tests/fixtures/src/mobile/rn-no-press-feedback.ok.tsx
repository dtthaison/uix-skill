import React from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Animated } from 'react-native';
export const A = () => <Pressable onPress={go} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}><Text>Buy</Text></Pressable>;
