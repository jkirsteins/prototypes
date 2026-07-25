VAR push_count = 0
VAR call_count = 0
VAR hinge_seen = false
VAR unsafe_memory = false
VAR build = "undetermined"
VAR strength = 0
VAR caution = 0
VAR ingenuity = 0
VAR perception = 0
VAR sanity = 0
VAR door_tried = false
VAR door_open = false
VAR bars_pried = false
VAR saved_spotted = ()
VAR escaped = false

LIST items = lining, nail, hinge, table, drawer, tinderbox, candle, hanging, cage, bucket, door, window, key, weak_door
VAR spotted = ()
VAR inventory = ()
VAR drawer_open = false
VAR candle_lit = false
VAR room_scanned = false
VAR light_scanned = false
VAR current_room = "coffin"

-> start

=== start ===
~ spotted += lining
Darkness, stale and tasting of dust. Velvet presses at your shoulders, and wood waits inches above your face.

{ push_count > 0:
Your arms remember the weight above you.
}
{ unsafe_memory:
Your own half-shout still hangs in your mind: maybe something out there heard.
}
{ inventory ? nail:
The bent nail rests in your fist, ugly and useful.
}

-> coffin_loop

=== coffin_loop ===
{ escaped:
    -> END
}

+ {not escaped} [Push against the wood above you.]
    ~ push_count = push_count + 1
    { push_count == 1:
        You shove upward. The wood shifts just enough to prove it can move, then settles back with a creak like a low wooden laugh.
    - else:
        { push_count == 2:
            You push again, harder. Dust falls into your mouth. The wood holds.
        - else:
            { push_count < 5:
                It doesn't budge.
            - else:
                ~ escaped = true
                ~ build = "strength"
                ~ strength = strength + 2
                The fifth shove is a declaration: metal screams, the wood tears loose and swings wide, and cold air pours in over your torn palms.
                -> lid_open
            }
        }
    }
    -> coffin_loop

+ {call_count == 0} [Call for help.]
    ~ call_count = call_count + 1
    ~ unsafe_memory = true
    You draw breath to shout, then stop halfway through the word. You do not know where you are, who put you here, or what might answer.
    -> coffin_loop

+ {call_count == 1} [Call out anyway.]
    ~ call_count = call_count + 1
    ~ caution = caution - 1
    You call out anyway, louder, the word cracking against the wood. Nothing answers - not a footstep, not a breath - and the silence afterward feels like it is listening.
    -> coffin_loop

+ {not hinge_seen} [Trace where the wood resists.]
    ~ hinge_seen = true
    ~ spotted += hinge
    You follow the resistance to one side, past a brass plate that rasps under your knuckles. There: a cramped hinge, half-hidden behind the plate's edge.
    -> coffin_loop

+ {unsafe_memory} [Remember why calling out felt dangerous.]
    You remember stopping yourself mid-shout. A prisoner who announces himself is either rescued or collected, and you do not yet know which story this is.
    -> coffin_loop

=== lid_open ===
~ spotted -= (lining, nail, hinge)
Above you, the dark gives way to a room. Grey light finds gilt mouldings gone green, a tall mirror clouded like a dead eye, a split chaise spilling its stuffing. Whoever kept this room loved it once, and no one has for a long time.

-> lid_open_loop

=== lid_open_loop ===
+ [Step into the room.]
    You haul yourself up and over the worn edge and drop into the room, the dust barely stirring.
    -> cell_room

=== cell_room ===
~ current_room = "cell"
~ spotted += (candle, door, window)
Cold rises through the flagstones into your bare ankles. Grey light leans through a barred window in ribbons of rotten curtain, and a heavy iron-banded door stands shut in the far wall, a grille at eye height. Beside it a single candle sits cold in its sconce, the wick a black curl.

-> cell_room_loop

=== cell_room_loop ===
+ [Look around.]
    { not room_scanned:
        ~ room_scanned = true
        ~ spotted += table
        Under the window, half-lost in the curtain's shadow, stands a small wooden table. Its squat, stubborn shape says it was dragged here from a better room.
    - else:
        { candle_lit and not light_scanned:
            ~ light_scanned = true
            ~ spotted += (hanging, cage, bucket)
            The candlelight pushes the shadows back, and the room gives up more of itself: a faded hanging worn to a ghost, an iron cage hung from a beam, a wooden bucket in the far corner.
        - else:
            You look, and look again. Nothing in particular catches your eye.
        }
    }
    -> cell_room_loop

+ { door_tried && not door_open } [Throw your weight against the door.]
    -> caution_door

+ { bars_pried } [Squeeze through the gap.]
    -> enter_niche

=== caution_door ===
~ door_open = true
~ caution = caution - 1
You hurl your weight at the door again and again, until the wormed wood splinters and the slab bursts outward.
-> corridor

=== corridor ===
~ current_room = "corridor"
~ spotted = ()
You step out onto a gallery of grey stone, where a staircase curls up toward a high window and thin daylight lies across the steps. Portraits watch from the walls, pale men whose painted eyes seem to follow you toward a door at the far end. Out of the dark that held you, at last, and nowhere near out of the castle.
-> corridor_loop

=== corridor_loop ===
+ [Start down the gallery.]
    Your bare feet find the cold carpet, and the castle takes the sound without an echo.
    -> END

=== enter_niche ===
~ current_room = "niche"
~ saved_spotted = spotted
~ spotted = ()
{ not (inventory ? key):
    ~ spotted += key
}
-> guard_niche

=== guard_niche ===
You fold yourself through the gap into a space barely wider than your shoulders, where a blade of pale daylight falls from a slit high in the wall. The air is colder here, and older.
{ not (inventory ? key):
    On the near wall, hung from an iron ring: a key, big and black with rust, cut for a lock that matters.
- else:
    The iron ring on the wall hangs empty now.
}
-> guard_niche_loop

=== guard_niche_loop ===
+ [Slip back through the gap.]
    ~ current_room = "cell"
    ~ spotted = saved_spotted
    ~ saved_spotted = ()
    { candle_lit:
        You fold yourself back through the gap into the low light.
    - else:
        You fold yourself back through the gap into the dark.
    }
    -> cell_room_loop

=== room_return ===
{ current_room == "niche": -> guard_niche_loop }
{ current_room == "corridor": -> corridor_loop }
{ current_room == "cell": -> cell_room_loop }
{ escaped: -> lid_open_loop }
-> coffin_loop

=== interact(verb, item) ===
{ verb == "look" and item == "lining": -> look_lining }
{ verb == "look" and item == "nail": -> look_nail }
{ verb == "use" and item == "nail": -> use_nail }
{ verb == "take" and item == "nail": -> take_nail }
{ verb == "look" and item == "hinge": -> look_hinge }
{ verb == "use" and item == "hinge": -> use_hinge }
{ verb == "look" and item == "table": -> look_table }
{ verb == "use" and item == "table": -> use_table }
{ verb == "look" and item == "drawer": -> look_drawer }
{ verb == "use" and item == "drawer": -> use_drawer }
{ verb == "look" and item == "tinderbox": -> look_tinderbox }
{ verb == "use" and item == "tinderbox": -> use_tinderbox }
{ verb == "take" and item == "tinderbox": -> take_tinderbox }
{ verb == "look" and item == "candle": -> look_candle }
{ verb == "use" and item == "candle": -> use_candle }
{ verb == "look" and item == "hanging": -> look_hanging }
{ verb == "look" and item == "cage": -> look_cage }
{ verb == "look" and item == "bucket": -> look_bucket }
{ verb == "look" and item == "door": -> look_door }
{ verb == "use" and item == "door": -> use_door }
{ verb == "look" and item == "weak_door": -> look_weak_door }
{ verb == "use" and item == "weak_door": -> use_weak_door }
{ verb == "look" and item == "window": -> look_window }
{ verb == "use" and item == "window": -> use_window }
{ verb == "look" and item == "key": -> look_key }
{ verb == "use" and item == "key": -> use_key }
{ verb == "take" and item == "key": -> take_key }
-> interact_fallback(verb, item)

= look_lining
{ (spotted ? nail) or (inventory ? nail):
    You go over the seam again, corner to corner. The velvet has given up all it knows.
- else:
    ~ spotted += nail
    Your fingers find a torn seam, then a rough nub of metal beneath it: a nail, loose in its post.
}
-> room_return

= look_nail
{ inventory ? nail:
    Bent, sharp, and mean enough to matter. It rides your fist like it belongs there.
- else:
    Small, but the only thing in here that was not made to hold you.
}
-> room_return

= use_nail
{ inventory ? nail:
    You turn the nail over in your fingers. It is waiting for something worth prying.
- else:
    The nail is still snagged in its seam. Your fingers want it in your fist first.
}
-> room_return

= take_nail
{ inventory ? nail:
    The nail is already in your fist, right where you want it.
- else:
    ~ spotted -= nail
    ~ inventory += nail
    You worry the nail back and forth until it gives up its post. Bent, sharp, and mean enough to matter.
}
-> room_return

= look_hinge
The hinge is cramped and stiff, its pin barely proud of the leaf. It was made to swing for someone standing outside.
-> room_return

= use_hinge
{ inventory ? nail:
    ~ escaped = true
    ~ build = "ingenious"
    ~ ingenuity = ingenuity + 2
    You slide the nail into the hinge gap and twist until the hinge buckles and the wood above you swings open with the offended groan of old carpentry.
    -> lid_open
- else:
    You work a fingertip into the hinge gap and pry. Flesh loses to iron, the way it always has.
}
-> room_return

= look_table
~ spotted -= table
~ spotted += drawer
The table has one drawer, set slightly proud of its frame, as if it started to open once and thought better of it.
-> room_return

= look_drawer
{ drawer_open:
    The drawer sags open on its runners, empty now but for dust and a smell of old iron.
- else:
    The drawer sits crooked in its housing - swollen wood, or something jammed; either way, it does not mean to come out politely.
}
-> room_return

= use_table
~ spotted -= table
~ spotted += drawer
You feel along the table's underside and find a drawer set flush in the frame.
-> force_drawer

= use_drawer
{ drawer_open:
    You slide the drawer back and forth on its runners. It has given you everything it had.
    -> room_return
}
-> force_drawer

= force_drawer
{ strength >= 2:
    ~ drawer_open = true
    ~ spotted += tinderbox
    The swollen drawer fights you the whole way, then gives all at once and jumps its runners into your grip. Inside, wrapped in waxed cloth: a small tin of flint, steel, and dry char cloth.
- else:
    You pull at the drawer. It shifts a hair's breadth and jams, as if a hand inside were holding it shut. Whatever it wants from you, you do not have it yet.
}
-> room_return

= look_tinderbox
{ inventory ? tinderbox:
    Flint, steel, char cloth. Small, dry, and willing.
- else:
    The tin sits in the ruined drawer, dented but shut tight against the years.
}
-> room_return

= use_tinderbox
{ inventory ? tinderbox:
    You turn the tin over in your hand. It wants something worth lighting.
- else:
    The tin lies in the drawer where you found it. Better in your hand first.
}
-> room_return

= take_tinderbox
{ inventory ? tinderbox:
    The tin is already in your hand, its weight a small comfort.
- else:
    ~ spotted -= tinderbox
    ~ inventory += tinderbox
    You lift the tin out of the drawer. It has a satisfying weight, like a promise kept.
}
-> room_return

= look_candle
{ candle_lit:
    The flame stands small and straight, its light leaning on the stone and staying there.
- else:
    A hand's length of tallow in an iron sconce. It has been waiting longer than you have.
}
-> room_return

= use_candle
{ candle_lit:
    The flame needs nothing more from you.
- else:
    { inventory ? tinderbox:
        ~ candle_lit = true
        You strike steel on flint until a spark takes in the char cloth, then touch it to the wick.

        The flame climbs and steadies, and the room steps closer: stone and iron and old cloth, leaning into the light.
    - else:
        You pinch the dead wick. Cold. You have nothing to wake it with.
    }
}
-> room_return

= look_hanging
Up close the hanging is all ghost: a garden, maybe, or a procession, worn to brown breath on cloth.
-> room_return

= look_cage
The cage is bird-sized, its little door ajar. Whatever it held left long ago, one way or another.
-> room_return

= look_bucket
The bucket has been mended twice with wire, and is dry as bone at the bottom.
-> room_return

= look_door
{ candle_lit:
    ~ spotted -= door
    ~ spotted += weak_door
    By candlelight the door shows its weakness: the hinge pins sit on this side, seated but never peened. Work them loose and the slab itself is the way out.
- else:
    Iron-banded oak, a grille at eye height, a keyhole gone black with age. It was built to keep something in, and it has not forgotten the work.
}
-> room_return

= use_door
{ door_open:
    -> corridor
}
{ inventory ? key:
    ~ door_open = true
    The rust-black key bites, resists, then turns with a deep iron clunk, and the lock lets go.
    -> corridor
}
~ door_tried = true
You try the door - it does not give a hair. The lock is a heavy warded thing with no key in it: whoever turned it last carried the key away.
-> room_return

= look_weak_door
The hinges are the flaw: pins seated on your side, waiting to be driven out.
-> room_return

= use_weak_door
{ strength >= 2:
    ~ door_open = true
    You drive the hinge pins up out of their seats and walk the loosened slab aside, far enough to pass.
    -> corridor
}
You can see the weakness, but your arms lack the strength to drive the pins clear.
-> room_return

= look_window
{ bars_pried:
    One bar hangs loose where you worked it out of the stone. The gap behind it breathes cold, older air.
- else:
    A row of iron bars, thick with rust, set into a low opening in the wall. The space behind them is not the outside - it is close, dim, and long forgotten.
}
-> room_return

= use_window
{ bars_pried:
    The bar is already out. The gap is there for the taking.
    -> room_return
}
{ inventory ? nail:
    ~ bars_pried = true
    You wedge the nail behind the most corroded bar and lever, throwing your weight on it until the old iron tears free of the mortar. A gap opens - narrow, but enough.
    -> room_return
}
You haul on the bars. They are set deep and mean to stay, and your fingers are no match for them.
-> room_return

= look_key
{ inventory ? key:
    Heavy and black with rust, cut for a single lock, and you can guess which.
- else:
    It hangs from an iron ring on the wall, catching the thin light. Big, rust-black, cut for a lock that matters.
}
-> room_return

= use_key
{ inventory ? key:
    The key is no use in your fist alone. It wants the lock it was cut for.
- else:
    Better in your hand first.
}
-> room_return

= take_key
{ inventory ? key:
    The key is already in your fist, cold and heavy.
- else:
    ~ spotted -= key
    ~ inventory += key
    You lift the key off its ring. It is heavier than it looks, and cold straight through.
}
-> room_return

=== interact_fallback(verb, item) ===
{
    - verb == "look":
        You study it a while longer. It tells you nothing new.
    - verb == "take":
        You take hold of it, but it stays where it is.
    - else:
        You try it this way and that, and nothing comes of it.
}
-> room_return
