# Manual mode check

Fresh preview from `/home/ubuntu/SIMGTA-full-audit` loaded the map and HUD. Clicking `ВЫХОД В ГОРОД` produced the action HUD (`HP 100`, `AMMO 50/99`, wanted status and WASD/F/G hint) while the clock, population, approval, demand, vehicles and pedestrians continued updating. No blank screen, React error or frozen canvas was observed.

The regression that caused the freeze was reproduced in Vitest: empty `keys` produced `Number(undefined) - Number(undefined)`, resulting in `NaN` player coordinates and an unsafe `tiles[ty][tx]` access. The fix normalizes key booleans and makes `isBlocked` finite/bounds-safe.

Zoom-selection follow-up: after the `screenToWorld` fix, the fresh preview remained interactive while switching from action mode back to strategy mode. The world-space camera and pointer conversion are now centralized in `Game.screenToWorld`, and the regression suite verifies the cursor anchor remains unchanged at clamped half and 3x zoom.
