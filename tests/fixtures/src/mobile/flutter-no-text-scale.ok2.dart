import 'package:flutter/material.dart';

Widget bump(BuildContext context, Widget child) {
  return MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(1.2)),
    child: child,
  );
}
