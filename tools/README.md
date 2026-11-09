# Tests and benchmarks (headless Firefox via Selenium)

Needs Python with `selenium` (`python -m venv venv && venv/Scripts/pip install selenium`). Run from this folder.

- `test_msf.py`: feature tests (20 checks: link cleaning, undo, pause, pop-up remover, Chrome mode, duplicate shortcut). Screenshots go to the `OUT` folder set at the top.
- `bench2.py`: speed. Two Firefox instances (without / with the add-on) loading local test pages in turn, medians in ms. `bench.py` holds the shared pages and helpers.
- `sticky_check.py`: "unstick headers" catches a sticky bar further down the page after scrolling.

Results on 2026-11-10 (headless, local pages): page load +1 to +4 ms; link with tracking +4 to +5 ms;
first load after the add-on was idle +3 to +20 ms; pop-up remover full scan of a 24,000-element page 2 to 6 ms
(was ~250 ms before the on-screen scan); no dropped frames on an animated page.
