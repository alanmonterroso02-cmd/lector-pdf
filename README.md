# Lector PDF

Aplicación Android para leer libros en PDF sin distracciones, **100 % offline**.
Hecha con HTML/CSS/JS + [pdf.js] y empaquetada con [Capacitor].

![icono](docs/icono.png)

## Funciones

- **Biblioteca**: importa PDFs desde el teléfono (selector de archivos) y quedan guardados dentro de la app.
- **Carpetas**: organiza por temas (Novela, Universidad, Trabajo…), renombra y mueve libros.
- **Lectura continua** con scroll suave y salto a cualquier página.
- **Zoom**: pellizco con dos dedos, botones de acercar/alejar y «ajustar a pantalla».
- **Modo noche** para las páginas (invierte los colores sin arruinar las imágenes) y modo **sepia**.
- **Brillo** ajustable de 30 % a 130 %.
- **Índice / marcadores** del propio PDF (si los tiene).
- **Búsqueda** de palabras o frases dentro del libro, con número de coincidencias por página.
- **Leer en voz alta (TTS)** con voz del sistema, velocidad ajustable y avance automático de página.
- **Guarda el progreso**: al volver a abrir el libro continúa en la página donde lo dejaste.
- Selección y copia de texto (capa de texto de pdf.js).
- Sin anuncios, sin permisos raros, sin internet.

## Cómo se compila

El APK se compila **en la nube** con GitHub Actions (no hace falta instalar Android SDK):

1. Cada `push` a `main` dispara el workflow `.github/workflows/android.yml`.
2. También se puede lanzar a mano desde la pestaña **Actions → Compilar APK → Run workflow**.
3. Al terminar, el APK queda como **artifact** llamado `lector-pdf-apk` (dentro va `app-debug.apk`).

### Compilar en local (opcional)

Requisitos: Node 20+, JDK 17, Android SDK 34.

```bash
npm install
npx cap sync android
cd android
./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## Instalar el APK en el teléfono

1. Copia `app-debug.apk` al teléfono (cable USB, WhatsApp, Drive…).
2. Ábrelo y acepta «Instalar apps desconocidas» para esa app cuando Android lo pida.
3. Listo.

> Es un APK **debug**: sirve para uso personal. Para publicar en Google Play hay que
> firmarlo con un keystore propio y generar un `.aab` de release.

## Estructura

```
www/                    aplicación web (UI + lógica)
  index.html            pantallas: biblioteca y lector
  styles.css            tema claro / sepia / oscuro
  app.js                biblioteca, IndexedDB, lector, búsqueda, TTS
  vendor/               pdf.js 3.11 (+ cmaps y fuentes estándar)
android/                proyecto Android generado por Capacitor
  app/src/main/res/     iconos y pantalla de arranque
tools/                  scripts de desarrollo (PDF de prueba, pruebas con Edge)
```

## Notas técnicas

- Los PDFs se guardan en **IndexedDB** (copia local del archivo), por eso la app funciona sin internet.
- El render usa `pdf.js` con canvas virtualizados: solo se dibujan las páginas visibles, así que aguanta libros de 1000+ páginas.
- El TTS usa `@capacitor-community/text-to-speech` (motor de voz de Android).

[pdf.js]: https://mozilla.github.io/pdf.js/
[Capacitor]: https://capacitorjs.com/
