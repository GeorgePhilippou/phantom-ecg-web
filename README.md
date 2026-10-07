# Phantom ECG Viewer — browser edition

Open https://GeorgePhilippou.github.io/phantom-ecg-web/ in a current desktop browser.
No Python installation or account is needed. Select **Try a synthetic ECG** to
explore the interface without an experimental recording.

## Everyday use

1. Drop one or several EDF files into the sidebar, or choose files.
2. Use each recording's checkbox to show/hide it. Expand **Channel & time shift** to choose
   a channel or enter a positive/negative time shift in seconds.
3. Choose Overlay or Stacked, and select an amplitude unit.
4. Select a region by dragging horizontally in the overview, moving the start/end
   sliders, or entering start/end seconds and clicking **Apply time window**.
   Full recording resets the view; Previous/Next move by the window width.
5. Enable Show time ruler. Click a waveform for A, then B, or type exact times.
   Equivalent phases on consecutive cycles measure a period; otherwise 1/Δt is
   only a reciprocal interval. Equal times have undefined reciprocal frequency.
6. Open Export comparison for CSV, PNG or metadata JSON.

Dark mode is remembered in this browser. Recordings are not stored across reloads;
reopen them after refreshing. Close the tab to release the recording session.

## Data and calibration

All decoding, plotting, measurements and exports happen locally in the browser.
There is no upload endpoint, analytics, CDN or external font request. GitHub serves
only application assets. A content security policy blocks network connections from
application JavaScript. The public repository contains only website code and
synthetic tests, not recordings. Patient/recording identification fields are not
retained in the decoded metadata.

Supports EDF and continuous EDF+C with channel-specific sampling rates, EDF+
annotations, calibrated physical units and signed little-endian samples. Rejects
BDF, discontinuous EDF+D, malformed headers and incomplete records. Original
sample times are index/sampling rate; end-window bounds are exclusive. Each file's
first sample is zero before an explicit time shift. Absolute clock synchronisation
and automatic beat alignment are not performed.

Recognised voltage units convert between µV/uV, mV and V. Other units stay as stored;
incompatible traces are explicitly excluded from the comparison. No filtering,
normalisation, baseline removal, interpolation or resampling is added.

Long traces use chronological min/max envelopes for plots and PNGs. On-screen
density follows the plot width; temporary zoom refines the displayed original
samples. Waveform arrays are cached, the overview is reused during navigation,
and ruler updates move cursors without rebuilding waveforms. Measurements are
calculated when their panel is opened. CSV exports
retain all original samples at each file's own sampling rate. Ruler clicks snap to
displayed original samples; use a narrow window for finer picking. PNG/CSV/JSON
use the chosen window and checked files, regardless of temporary plot zoom or
legend-only hiding. The toolbar PNG saves the current on-screen view.

Browser limit: 100 MB per file, 200 MB total. Larger experiments can use the separate
Python viewer. This is an initial research viewer: verify the same channel, units
and selected window with EDFbrowser when trying a new recording format.

## Validation and development

`node --test tests/core.test.mjs` covers calibration, mixed sample rates, annotations,
malformed/discontinuous files, original shifted sample windows, CSV escaping,
unit conversion, display peak preservation, navigation and ruler arithmetic.
GitHub Actions runs these checks before publishing only the static app assets.

The same reader was independently checked against PyEDFlib: all 155,648 samples
of the owner's 1,024 Hz example agreed within 1.82e-12 µV. The example recording
is not included. Real browser file selection, window navigation, overview selection,
ruler clicks and CSV/PNG export were checked locally. Safari layout was checked
before and after isolating the app grid from chart-generated body elements; hiding
and restoring every recording was checked to preserve overview selection.
Chart containers are observed for resizing when the browser pane changes width.
Manual Windows browser use
and direct EDFbrowser comparison remain acceptance checks.

For a local development preview, serve this directory with any static HTTP server
(for example `python3 -m http.server 8503`), then open http://127.0.0.1:8503/.
ES modules and workers need an HTTP origin; double-clicking index.html is not the
normal launch method. Plotly.js 3.7.0 is bundled under its MIT license in vendor/.
