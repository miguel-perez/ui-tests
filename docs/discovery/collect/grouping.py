# Cross-account grouping plan for the D0 study. Dry-run checks coverage; --apply records it in the graph.
import subprocess, sys, re
def ids(s): return [f"s{x}" for x in s.replace("\n"," ").replace(","," ").split()]
L1 = {
 "G1":  ("Put it in front of real people early, to learn whether anyone wants it and what breaks",
         ids("14 15 40 42 44 59 72 73 74 75 87 88 89 90 92 102 104 105 130 164 165 187 188 189 231 232 249 254 255 70 11 94 328 334 436 492")),
 "G2":  ("Realize I built on my own assumptions without a feedback loop, and that early enthusiasm did not predict use",
         ids("23 24 25 69 84 85 86 100 101 245 58 52 53")),
 "G3a": ("Want outside eyes on what I built because I can no longer see it fresh",
         ids("45 54 68 67 474 475 476 477 478 31 33 61 109 98 99 116 131 177 190 161 91 80 394 333 158 215 136 138 62 63 64 65 160")),
 "G3b": ("Turn to a community for how-to or validation because I have no reference to lean on",
         ids("16 20 30 32 55 216 292 303 318 351 362 376 401 421 427 464 479 483 496 500 504 517 518 519 520 313 5 46 342")),
 "G4":  ("Discount signals that are not observed behaviour: friends' excitement, surveys, ratings, what people say to please me",
         ids("12 13 426 425 200 493 494 495 229 8 9 10 36 82 156")),
 "G17": ("Take people's stated liking as the evidence I have so far",
         ids("50 244 274 60")),
 "G5":  ("Find that watching people use it reveals what I could never see myself",
         ids("41 96 110 112 137 145 166 167 168 217 222 223 227 228 234 240 241 243 257 258 262 264 266 267 271 300 301 363 364 365 433 453 467 468 486 490 171 170 37 209 392 7 472 95 343")),
 "G5b": ("Fear the problems I have not looked for yet",
         ids("302 387 83 195 196 148 207 213")),
 "G9c": ("Rig up a cheap way to capture what people do",
         ids("48 49 482 484 485 487 488 489 491 163 230 284 293 294 295 296 197 78 79 469 470 471")),
 "G6":  ("Change or simplify the thing because of what people could not get through",
         ids("22 43 111 146 176 218 225 226 233 259 265 521 522 523 76 77 430 432 268 3")),
 "G6b": ("Search for a fix after the test exposes a problem the standard guidance does not solve",
         ids("366 367 368 369 370 371 372 373 374 375 307 306")),
 "G7":  ("Hold my ground against opinion by proving it with observed behaviour",
         ids("201 202 462")),
 "G8":  ("Decide what a finding means before acting: real problem, novelty, small sample, or noise",
         ids("431 435 434 473 38 39 337 338 341 344 345 346 335 336 438 439 440 314 327 325 326 117 429 329")),
 "G9a": ("Work out the tasks, script and setup so the test is fair",
         ids("378 379 380 381 316 317 508 509 510 511 512 513 514 515 516 480 481 310 348 349 350 347 457 458")),
 "G9b": ("Handle what happens in the room: whether to intervene, how long it takes, which devices, which users",
         ids("454 455 419 420 422 311 315")),
 "G10a":("Find participants who match my audience",
         ids("17 19 26 27 28 29 198 260 447 456 437")),
 "G10b":("Get the build somewhere people can safely try it",
         ids("18 155 157 159 279 280 281 406 407 289 290 291")),
 "G11": ("Hit tools and services that block or price out an individual or a small team",
         ids("413 414 415 416 417 182 183 184 185 186 113 114 503 505 506 119 192 193 194 191")),
 "G11b":("Build my own tool because nothing does what I need",
         ids("115 118 124 125 151 150 149 180 181 210")),
 "G12": ("Weigh whether testing is worth the time and money at all",
         ids("405 408 409 410 411 412 66 34 35 273 275 276 277 278 502 418")),
 "G14": ("Want to know continuously, in the build loop and in production, whether it works for users",
         ids("6 81 121 122 123 152 153 179 208 211 212 214 386 154")),
 "G15": ("Hold building, promoting and testing in tension",
         ids("239 242 51 93 246 247 248 250 251 252 253 330 331 332 256 47 339 340")),
 "G13a":("Push for research against intuition, authority or disinterest",
         ids("1 2 297 298 299 312 463 441 442 443 444 445 446")),
 "G13b":("Reconcile what the client or team set up with what I think needs finding out",
         ids("353 354 355 356 357 358 359 360 361 451 448 449 450 452 460 461 377 459")),
 "G16a":("Build what I myself need or find missing",
         ids("57 126 127 128 129 132 133 134 135 162 172 173 174 175 178 199 203 204 205 206 221 139 140 141 97 382 383 384 385 388 389 390 391 507 71")),
 "G16b":("Learn the hard way what the real difficulty is while building",
         ids("142 143 144 147 235 236 237 238 304 305 308 309 286 288 282 283 287 285 103 107 108 106 120 269 270 272 169")),
 "G16c":("Reason about whether users will understand, without having watched them",
         ids("319 320 321 322 324 323 393 395 396 397 398 399 400 402 403 404 465 466 497 498 499 501 224 263 219 220 261 424 423 4 428")),
}
SET_ASIDE = {"s21":"meta decision about how to write the post, not about finding out", "s352":"writing-time privacy choice, not about finding out", "s56":"decision about what to post, not about finding out", "s42":"placed in G1"}
SET_ASIDE.pop("s42")
L2 = {
 "A": ("Get evidence from reality rather than from my own head", ["G1","G2","G3a","G4","G17"]),
 "B": ("See what people actually do with it", ["G5","G5b","G9c"]),
 "C": ("Act on what the test shows", ["G6","G6b","G7","G8"]),
 "D": ("Run a sound test without a researcher", ["G9a","G9b","G3b","G10a","G10b"]),
 "E": ("Afford the test and fit it into how I build", ["G11","G11b","G12","G14","G15"]),
 "F": ("Make testing count with the people around me", ["G13a","G13b"]),
 "G": ("Build and judge from my own need and reasoning", ["G16a","G16b","G16c"]),
}
L3 = {
 "X": ("Find out from real people whether what I built works for them", ["A","B","C"]),
 "Y": ("Make testing possible: method, people, money, time and buy-in", ["D","E","F"]),
 "Z": ("Build and judge from my own need and reasoning", ["G"]),
}
ADDRESS = ["A","B","C","D","E","F","G16c"]
all_assigned=[s for g in L1.values() for s in g[1]]
dups=[s for s in set(all_assigned) if all_assigned.count(s)>1]
universe={f"s{i}" for i in range(1,524)}
missing=sorted(universe-set(all_assigned)-set(SET_ASIDE), key=lambda x:int(x[1:]))
print("assigned",len(set(all_assigned)),"dups",dups,"missing",missing)
if "--apply" in sys.argv:
    def run(*a):
        r=subprocess.run(["python3","graph.py",*a],capture_output=True,text=True); out=(r.stdout+r.stderr).strip()
        if r.returncode!=0 or "refused" in out: sys.exit(f"graph.py {' '.join(a[:3])} failed (exit {r.returncode}): {out[:300]}")
        return out
    gid={}
    for k,(label,members) in L1.items():
        out=run("add-group","--level","level1","--label",label); gid[k]=out.splitlines()[0].strip(); 
        for s in members: run("link",s,"member-of",gid[k])
    for k,(label,children) in L2.items():
        out=run("add-group","--level","level2","--label",label); gid[k]=out.splitlines()[0].strip()
        for c in children: run("link",gid[c],"part-of",gid[k])
    for k,(label,children) in L3.items():
        out=run("add-group","--level","level3","--label",label); gid[k]=out.splitlines()[0].strip()
        for c in children: run("link",gid[c],"part-of",gid[k])
    for k in ADDRESS: run("link",gid[k],"addresses","q1")
    for s in SET_ASIDE: run("set-aside",s)
    print(gid)
