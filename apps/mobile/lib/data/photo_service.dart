import 'dart:io';
import 'dart:math';

import 'package:flutter/painting.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

enum PhotoSource { camera, gallery }

/// Photos attached to logbook entries. They live in the app's own storage and never leave the phone: there is no upload.
/// One seam so screens are testable without a camera and so the web build (no file storage) can simply hide the feature.
abstract class PhotoService {
  /// False where photos cannot be kept (the web build).
  bool get available;

  /// Lets the traveller pick or take a photo and stores a copy. Returns its file name, or null when cancelled or failed.
  Future<String?> add(PhotoSource source);

  /// Removes the stored file (a no-op when it is already gone).
  Future<void> delete(String name);

  /// The image to show for a stored file, or null when it is missing.
  ImageProvider? imageFor(String name, {int? cacheWidth});
}

class NoPhotoService implements PhotoService {
  const NoPhotoService();

  @override
  bool get available => false;

  @override
  Future<String?> add(PhotoSource source) async => null;

  @override
  Future<void> delete(String name) async {}

  @override
  ImageProvider? imageFor(String name, {int? cacheWidth}) => null;
}

/// Stores photos under `<app documents>/flight-photos/`. Images are downscaled at pick time (long edge 1600 px, JPEG 80)
/// so a logbook of hundreds of photos stays small.
class DevicePhotoService implements PhotoService {
  DevicePhotoService(Directory documents, {ImagePicker? picker})
    : _dir = Directory('${documents.path}/flight-photos'),
      _picker = picker ?? ImagePicker();

  final Directory _dir;
  final ImagePicker _picker;

  @override
  bool get available => true;

  @override
  Future<String?> add(PhotoSource source) async {
    try {
      final picked = await _picker.pickImage(
        source: source == PhotoSource.camera ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
      );
      if (picked == null) return null;
      await _dir.create(recursive: true);
      final name = '${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(1 << 20).toRadixString(36)}.jpg';
      await File('${_dir.path}/$name').writeAsBytes(await picked.readAsBytes(), flush: true);
      return name;
    } catch (_) {
      return null;
    }
  }

  /// Only ever a plain file name inside the photo folder (stored names are validated on load, but this is the last gate).
  File? _file(String name) =>
      RegExp(r'^[A-Za-z0-9][A-Za-z0-9._-]*$').hasMatch(name) && !name.contains('..') ? File('${_dir.path}/$name') : null;

  @override
  Future<void> delete(String name) async {
    try {
      final f = _file(name);
      if (f != null && await f.exists()) await f.delete();
    } catch (_) {
      // an orphaned file is harmless
    }
  }

  @override
  ImageProvider? imageFor(String name, {int? cacheWidth}) {
    final f = _file(name);
    if (f == null || !f.existsSync()) return null;
    final image = FileImage(f);
    return cacheWidth == null ? image : ResizeImage(image, width: cacheWidth);
  }
}

/// Defaults to "no photos"; `main` replaces it with [DevicePhotoService] once the documents folder is known.
final photoServiceProvider = Provider<PhotoService>((ref) => const NoPhotoService());
