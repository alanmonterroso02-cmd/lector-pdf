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
- **TTS sin conexión**: la app detecta las voces instaladas, prefiere una **voz local** y avisa si el teléfono solo tiene voces online. En Ajustes → **Texto a voz** puedes ver qué voces funcionan sin internet, elegir una y abrir la pantalla de Android para descargar más.
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

## Voz sin conexión (TTS)

El motor de voz es el de Android, así que la lectura offline depende de que el teléfono
tenga la voz descargada:

1. Abre la app → ⚙️ **Ajustes** → **Texto a voz**.
2. Ahí ves cada voz con la etiqueta **sin conexión** o **requiere internet**.
3. Toca **Descargar voces del sistema** (abre la pantalla de datos de voz de Android) e instala la voz del español.
4. Vuelve, elige la voz «sin conexión» y prueba apagando los datos.

Alternativa manual: *Ajustes de Android → Sistema → Idiomas e introducción de texto →
Salida de texto a voz → Motor de Google → ⚙️ → Instalar datos de voz → Español*.

Si no hay ninguna voz local, la app avisa al empezar a leer y usa la voz online.

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
