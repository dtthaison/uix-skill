import React from 'react';
import { View, Text, ScrollView, FlatList, Pressable, Animated } from 'react-native';
export const A = () => <Pressable onPress={go} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}><Ionicons name="close" size={24} /></Pressable>; // FIRES
