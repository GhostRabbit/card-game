# Protocol Color Map

This map uses both protocol color dimensions in one node:

- Fill color = primary color (`PROTOCOL_COLORS`)
- Border color = accent color (`PROTOCOL_ACCENT_COLORS`)

```mermaid
flowchart TB

subgraph Main_Unit_1
DRK[Darkness]
DTH[Death]
FIR[Fire]
GRV[Gravity]
LIF[Life]
LGT[Light]
MTL[Metal]
PLG[Plague]
PSY[Psychic]
SPD[Speed]
SPR[Spirit]
WTR[Water]
end

subgraph Main_Unit_2
LCK[Luck]
SMK[Smoke]
CLR[Clarity]
TIM[Time]
FEA[Fear]
WAR[War]
ICE[Ice]
CHA[Chaos]
MIR[Mirror]
PEA[Peace]
CRG[Courage]
COR[Corruption]
end

subgraph Aux_1
APY[Apathy]
LOV[Love]
HAT[Hate]
end

subgraph Aux_2
DIV[Diversity]
UNI[Unity]
ASM[Assimilation]
end

style APY fill:#704661,stroke:#768c93,stroke-width:4px,color:#ffffff
style DRK fill:#1f2140,stroke:#451eca,stroke-width:4px,color:#ffffff
style DTH fill:#52090b,stroke:#e3d8b6,stroke-width:4px,color:#ffffff
style FIR fill:#6c1800,stroke:#ff6501,stroke-width:4px,color:#ffffff
style MTL fill:#003140,stroke:#083859,stroke-width:4px,color:#ffffff
style PLG fill:#5e4812,stroke:#97e308,stroke-width:4px,color:#ffffff
style PSY fill:#2b0b4f,stroke:#001d71,stroke-width:4px,color:#ffffff
style SPD fill:#403206,stroke:#00ffc3,stroke-width:4px,color:#ffffff
style SPR fill:#290056,stroke:#e79dfc,stroke-width:4px,color:#ffffff
style WTR fill:#0d44a1,stroke:#317cff,stroke-width:4px,color:#ffffff

style GRV fill:#402b21,stroke:#9c8724,stroke-width:4px,color:#ffffff
style LIF fill:#0c4c1b,stroke:#0ee458,stroke-width:4px,color:#ffffff
style LGT fill:#134008,stroke:#ffee09,stroke-width:4px,color:#ffffff
style LCK fill:#6b3f02,stroke:#ffbc00,stroke-width:4px,color:#ffffff
style SMK fill:#402e15,stroke:#ccc9fb,stroke-width:4px,color:#ffffff
style CLR fill:#9a7766,stroke:#a7ffff,stroke-width:4px,color:#ffffff
style TIM fill:#818352,stroke:#ffd482,stroke-width:4px,color:#ffffff
style FEA fill:#595881,stroke:#ff7a6f,stroke-width:4px,color:#ffffff
style WAR fill:#334029,stroke:#b6361a,stroke-width:4px,color:#ffffff
style ICE fill:#008bb9,stroke:#92cbe8,stroke-width:4px,color:#ffffff
style CHA fill:#40252f,stroke:#ff00ff,stroke-width:4px,color:#ffffff
style MIR fill:#051140,stroke:#ccf0ff,stroke-width:4px,color:#ffffff
style PEA fill:#094421,stroke:#cef9c7,stroke-width:4px,color:#ffffff
style CRG fill:#282440,stroke:#18a0ff,stroke-width:4px,color:#ffffff
style COR fill:#40193c,stroke:#8cee9a,stroke-width:4px,color:#ffffff

style LOV fill:#400a23,stroke:#fe8fb8,stroke-width:4px,color:#ffffff
style HAT fill:#5c0026,stroke:#ff0042,stroke-width:4px,color:#ffffff

style DIV fill:#923db1,stroke:#af5aef,stroke-width:4px,color:#ffffff
style UNI fill:#193945,stroke:#0ec8bb,stroke-width:4px,color:#ffffff
style ASM fill:#0e3540,stroke:#e9ff70,stroke-width:4px,color:#ffffff
```

## Hex Table

| Protocol | Primary | Accent |
|---|---|---|
| Apathy | `#704661` | `#768c93` |
| Darkness | `#1f2140` | `#451eca` |
| Death | `#52090b` | `#e3d8b6` |
| Fire | `#6c1800` | `#ff6501` |
| Gravity | `#402b21` | `#9c8724` |
| Hate | `#5c0026` | `#ff0042` |
| Life | `#0c4c1b` | `#0ee458` |
| Light | `#134008` | `#ffee09` |
| Love | `#400a23` | `#fe8fb8` |
| Metal | `#003140` | `#083859` |
| Plague | `#5e4812` | `#97e308` |
| Psychic | `#2b0b4f` | `#001d71` |
| Speed | `#403206` | `#00ffc3` |
| Spirit | `#290056` | `#e79dfc` |
| Water | `#0d44a1` | `#317cff` |
| Diversity | `#923db1` | `#af5aef` |
| Luck | `#6b3f02` | `#ffbc00` |
| Smoke | `#402e15` | `#ccc9fb` |
| Clarity | `#9a7766` | `#a7ffff` |
| Unity | `#193945` | `#0ec8bb` |
| Time | `#818352` | `#ffd482` |
| Fear | `#595881` | `#ff7a6f` |
| War | `#334029` | `#b6361a` |
| Ice | `#008bb9` | `#92cbe8` |
| Chaos | `#40252f` | `#ff00ff` |
| Mirror | `#051140` | `#ccf0ff` |
| Peace | `#094421` | `#cef9c7` |
| Assimilation | `#0e3540` | `#e9ff70` |
| Courage | `#282440` | `#18a0ff` |
| Corruption | `#40193c` | `#8cee9a` |

## Diversity Pairings and Grayscale Diagram

Pairing metric used:

`diversity(A,B) = deltaE76(primaryA, primaryB) + deltaE76(accentA, accentB)`

Grayscale mapping:
- Black (`#000000`) = equal colors (score `0`)
- White (`#ffffff`) = maximum observed pairing score in the current palette
- Diagram/table show only unique protocol pairs (upper-triangle view); mirrored duplicates and self-comparisons are intentionally omitted.

### 5 Lowest Diversity Pairings

| Rank | Protocol A | Protocol B | Diversity Score |
|---:|---|---|---:|
| 1 | Courage | Water | 71.67 |
| 2 | Life | Plague | 71.67 |
| 3 | Courage | Metal | 71.69 |
| 4 | Light | Plague | 71.70 |
| 5 | Apathy | Smoke | 71.71 |

Full pairings score table:
- [docs/protocol-diversity-pairings.md](protocol-diversity-pairings.md)

Grayscale diversity diagram:

![Protocol Pair Diversity Heatmap](protocol-diversity-heatmap.svg)
