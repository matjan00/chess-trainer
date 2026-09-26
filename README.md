# Chess trainer

Personal chess training app for Janczu00, published at https://claude.ai/artifact/EE2Q6jMmP6EM89uMvvW2NP

## Everyday use
- **New games:** double-click `update.bat`, wait for "Done", then ask Claude to "publish my chess trainer".
- **Lichess games too:** put your Lichess username in `config.json` (`"lichess": "yourname"`).

## Backups
- The project is a git repository: every change is kept in its history.
- **Automatic backup:** Windows Task Scheduler runs `backup.ps1` daily at 21:00 (task "Chess trainer daily backup"; if the PC is off, it runs at the next start).
  It saves a snapshot of any changes, then copies the whole history to `OneDrive\Backups\chess-trainer\` as one `.bundle` file. The newest 14 are kept. `backup.log` in that folder lists every run.
- **Restore:** in a terminal, `git clone "C:\Users\mateu\OneDrive\Backups\chess-trainer\<newest>.bundle" chess-trainer-restored`, then copy the `engine` folder back in (or re-download Stockfish).
- Not backed up (on purpose): `engine/` (Stockfish, 100 MB, re-downloadable) and `dist/` (rebuilt by `build.py`).

## Working with several Claude agents
- Each agent gets its own copy of the project, a git *worktree*, in `C:\Users\mateu\chess-trainer-work\<name>`, on its own branch `agent/<name>`. The main copy here is never edited by agents.
- Each agent is told which files it may change. `app.html` is only changed in the main copy, one change at a time.
- Claude reviews each branch, runs the Stockfish checks, merges it into `main` and tests before anything is published. Only the main copy is published.
- Tag `before-agents` marks the state before the first multi-agent round (`git reset --hard before-agents` undoes everything after it).

## Main files
| File | What it is |
|---|---|
| `app.html` | The web page (all sections) |
| `courses.txt` | Opening courses; `compile_courses.py` checks every move with Stockfish |
| `data/essentials.json` | Essential endgame lessons |
| `analyze.py`, `build*.py` | Game analysis and exercise builders |
| `update.py` / `update.bat` | Pull new games and rebuild everything |
| `notes.html` | Coach's notes on the Report page (hand-written) |
