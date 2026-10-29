import 'package:flutter/material.dart';

Widget panel(bool open) {
  return AnimatedContainer(
    duration: const Duration(milliseconds: 300),
    curve: Curves.linear, // FIRES
    height: open ? 240 : 120,
  );
}
