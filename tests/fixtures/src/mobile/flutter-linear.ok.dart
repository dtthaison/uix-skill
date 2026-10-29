import 'package:flutter/material.dart';

class _S extends State<W> with SingleTickerProviderStateMixin {
  late final c = AnimationController(vsync: this, duration: const Duration(seconds: 1))..repeat();
  late final a = CurvedAnimation(parent: c, curve: Curves.linear);
}
