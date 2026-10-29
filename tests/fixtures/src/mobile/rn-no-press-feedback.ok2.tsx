import React from 'react';
import { View, Pressable } from 'react-native';
export const A = () => <Pressable onPress={go}>{({ pressed }) => <View style={{ opacity: pressed ? 0.5 : 1 }} />}</Pressable>;
