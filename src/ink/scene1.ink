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
VAR pins_seen = false
VAR door_open = false
VAR bars_pried = false
VAR saved_spotted = ()
VAR escaped = false

LIST items = lining, nail, hinge, table, drawer, tinderbox, candle, hanging, cage, bucket, door, window, key
VAR spotted = ()
VAR inventory = ()
VAR drawer_open = false
VAR candle_lit = false
VAR room_scanned = false
VAR light_scanned = false
VAR current_room = "coffin"

-> start

=== start ===
# image:coffin
~ spotted += lining
Darkness. The air is stale and tastes of dust.

Velvet presses against your shoulders. Wood waits inches above your face.

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
        # image:coffin-strain
        You shove upward. The wood shifts just enough to prove it can move, then settles back into its groove.

        Your shoulders burn. Somewhere in the joinery, something creaks like a low wooden laugh.
    - else:
        { push_count == 2:
            # image:coffin-strain
            You push again, harder. Dust falls into your mouth. The wood holds.
        - else:
            { push_count < 5:
                # image:coffin-strain
                It doesn't budge.
            - else:
                ~ escaped = true
                ~ build = "strength"
                ~ strength = strength + 2
                The fifth shove is not elegant. It is not clever. It is a declaration.

                Metal screams. The wood above you tears loose and swings wide, and cold air pours in over the splinters in your palms.
                -> lid_open
            }
        }
    }
    -> coffin_loop

+ {call_count == 0} [Call for help.]
    # image:coffin-echo
    ~ call_count = call_count + 1
    ~ unsafe_memory = true
    You draw breath to shout, then stop halfway through the word.

    You do not know where you are. You do not know who put you here. You do not know what might answer.
    -> coffin_loop

+ {call_count == 1} [Call out anyway.]
    # image:coffin-echo
    ~ call_count = call_count + 1
    ~ caution = caution - 1
    You call out anyway, louder, the word cracking against the wood.

    Nothing answers. Not a footstep, not a breath. The silence afterward feels like it is listening.
    -> coffin_loop

+ {not hinge_seen} [Trace where the wood resists.]
    # image:coffin-hinge
    ~ hinge_seen = true
    ~ spotted += hinge
    You follow the resistance to one side, past a small brass plate that rasps under your knuckles. There: a cramped hinge, half-hidden behind the plate's edge.
    -> coffin_loop

+ {unsafe_memory} [Remember why calling out felt dangerous.]
    # image:coffin-echo
    You remember stopping yourself mid-shout.

    A prisoner who announces himself is either rescued or collected. You do not yet know which story this is.
    -> coffin_loop

=== lid_open ===
# image:lid-open
~ spotted -= (lining, nail, hinge)
Above you, the dark gives way to a room.

Grey light finds gilt mouldings gone green with age, a tall mirror clouded like a dead eye, a chaise whose upholstery has split and spilled its stuffing. Cobwebs sag from the cornices. Nothing moves.

Whoever kept this room loved it once. Nobody has loved it for a long time.

-> lid_open_loop

=== lid_open_loop ===
+ [Step into the room.]
    You take hold of the worn edges and pull yourself up and over. Your legs are slow to remember their work, but they hold.

    Dust stirs around your feet and settles. The room accepts you without a sound.
    -> cell_room

=== cell_room ===
# image:cell-room
~ current_room = "cell"
~ spotted += (candle, door, window)
Cold rises through the flagstones and finds your bare ankles at once.

Grey light leans in through a barred window, strained through the ribbons of a curtain long past its duty. A heavy door stands shut in the far wall, banded in iron, with a small grille set at eye height. Along the stone, chains hang slack and patient, and a low pallet holds a blanket someone left twisted, as if they got up in a hurry.

A single candle sits cold in a sconce by the door, its wick a black curl. Nobody has needed light here for a long time.

-> cell_room_loop

=== cell_room_loop ===
+ [Look around.]
    { not room_scanned:
        ~ room_scanned = true
        ~ spotted += table
        Under the window, half-lost in the curtain's shadow, stands a small wooden table. Something about its squat, stubborn shape says it was dragged here from a better room.
    - else:
        { candle_lit and not light_scanned:
            ~ light_scanned = true
            ~ spotted += (hanging, cage, bucket)
            The candlelight pushes the shadows back to the corners, and the room gives up more of itself: a faded hanging on the wall, its picture worn to a ghost; an iron cage hanging still from a beam; a wooden bucket waiting in the far corner.
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
You back off a step and hurl your whole weight at the door. The iron holds - but the wood around it is old and worm-run, and on the third blow the frame lets go with a crack and the whole slab bursts outward.
-> corridor

=== corridor ===
# image:corridor
~ current_room = "corridor"
~ spotted = ()
The door gives, and the cold breath of a far larger place moves past you.

You step out onto a gallery of grey stone. A staircase curls up toward a high window where real daylight - thin, but daylight - lies across the steps. Tall arched panes march down one wall, and beyond them: open sky, and the blue suggestion of hills a long way off. A strip of red carpet, worn to its threads, runs the length of the floor. Portraits watch from their frames, pale men in old collars, their painted eyes turned toward a door at the far end. A suit of armour stands sentinel beside it, and does not move.

Out of the dark that held you, at last. Nowhere near out of the castle.
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
# image:guard-niche
You fold yourself through the gap and drop into a space barely wider than your shoulders. A blade of pale daylight falls from a slit high in the far wall, thick with drifting dust. The air is colder here, and older.

Behind you, the barred gap gives back onto the dark you crawled out of. A three-legged stool waits under a plank shelf, where a dented tin cup keeps company with a candle-stub gone to a hard grey lump. And on the near wall, hung from an iron ring and catching what little light there is: a key. Big, black with rust, and cut for a lock that matters.
-> guard_niche_loop

=== guard_niche_loop ===
+ [Slip back through the gap.]
    ~ current_room = "cell"
    ~ spotted = saved_spotted
    ~ saved_spotted = ()
    { candle_lit:
        You fold yourself back through the gap into the low light. # image:cell-room-lit
    - else:
        You fold yourself back through the gap into the dark. # image:cell-room
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
{ verb == "look" and item == "window": -> look_window }
{ verb == "use" and item == "window": -> use_window }
{ verb == "look" and item == "key": -> look_key }
{ verb == "use" and item == "key": -> use_key }
{ verb == "take" and item == "key": -> take_key }
-> interact_fallback(verb, item)

= look_lining
# image:coffin-lining
{ (spotted ? nail) or (inventory ? nail):
    You go over the seam again, corner to corner. The velvet has given up all it knows.
- else:
    ~ spotted += nail
    Your fingers find a torn seam in the velvet, then a rough nub of metal beneath it. A nail, loose in its post.
}
-> room_return

= look_nail
# image:coffin-nail
{ inventory ? nail:
    Bent, sharp, and mean enough to matter. It rides your fist like it belongs there.
- else:
    It is small, but it is the only thing in here that was not made to hold you.
}
-> room_return

= use_nail
# image:coffin-nail
{ inventory ? nail:
    You turn the nail over in your fingers. It is waiting for something worth prying.
- else:
    The nail is still snagged in its seam. Your fingers want it in your fist first.
}
-> room_return

= take_nail
# image:coffin-nail
{ inventory ? nail:
    The nail is already in your fist, right where you want it.
- else:
    ~ spotted -= nail
    ~ inventory += nail
    You worry the nail back and forth until it gives up its tiny post. It is bent, sharp, and mean enough to matter.
}
-> room_return

= look_hinge
# image:coffin-hinge
The hinge is cramped and stiff, its pin barely proud of the leaf. It was made to swing for someone standing outside.
-> room_return

= use_hinge
# image:coffin-hinge
{ inventory ? nail:
    ~ escaped = true
    ~ build = "ingenious"
    ~ ingenuity = ingenuity + 2
    You slide the nail into the hinge gap and twist until the metal complains.

    It is not a key. It is not a tool. But it is enough. The hinge buckles, and the wood above you swings open with the offended groan of old carpentry.
    -> lid_open
- else:
    You work a fingertip into the hinge gap and pry. Flesh loses to iron, the way it always has.
}
-> room_return

= look_table
~ spotted -= table
~ spotted += drawer
The table has one drawer, set slightly proud of its frame, as if it started to open once and thought better of it. The rest is scarred wood and old candle grease.
-> room_return

= look_drawer
{ drawer_open:
    The drawer sags open on its runners, empty now but for dust and a smell of old iron.
- else:
    The drawer sits crooked in its housing. Swollen wood, or something jammed; either way, it does not mean to come out politely.
}
-> room_return

= use_table
~ spotted -= table
~ spotted += drawer
You crouch and feel along the table's underside. There, set flush in its frame: a drawer.
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
    The drawer is swollen into its frame and means to stay there. You set your feet, take its lip in both hands, and haul until your arms shake and the wood howls. It fights you the whole way, then gives all at once, jumping its runners into your grip.

    Inside, wrapped in a scrap of waxed cloth: a small tin, and in it flint, steel, and a pinch of char cloth that has kept itself dry all this time.
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
    The flame stands small and straight, minding its own business. Its light leans on the stone and stays there.
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
        You strike steel against flint until a spark takes in the char cloth, coax it aglow, and touch it to the wick. # image:cell-room-lit

        The flame climbs and steadies, and the room steps closer: stone and iron and old cloth, all leaning into the light.
    - else:
        You pinch the dead wick. Cold. You have nothing to wake it with.
    }
}
-> room_return

= look_hanging
Up close the hanging is all ghost: a garden, maybe, or a procession, worn down to brown breath on cloth.
-> room_return

= look_cage
The cage is bird-sized, its little door ajar. Whatever it held left long ago, one way or another.
-> room_return

= look_bucket
The bucket has been mended twice with wire, and is dry as bone at the bottom.
-> room_return

= look_door
{ candle_lit:
    ~ pins_seen = true
    By the candlelight you can see what the dark kept hidden: the great hinge pins sit on this side, seated but never peened over. Drive them up and out, and the slab itself becomes the way through.
- else:
    Iron-banded oak, a grille at eye height, a keyhole gone black with age. It was built to keep something in, and it has not forgotten the work.
}
-> room_return

= use_door
{ door_open:
    -> corridor
}
{ pins_seen && strength >= 2:
    ~ door_open = true
    You set your shoulder beneath the door's edge and drive the hinge pins up out of their seats, one and then the other. The whole slab tips loose of its frame, and you walk it aside far enough to pass.
    -> corridor
}
{ inventory ? key:
    ~ door_open = true
    You fit the rust-black key to the keyhole. It bites, resists, then turns with a deep iron clunk, and the lock lets go.
    -> corridor
}
~ door_tried = true
You try the door. It does not give a hair. The lock is a heavy warded thing, and there is no key in it - whoever turned it last carried the key away.
-> room_return

= look_window
{ bars_pried:
    One bar hangs loose where you worked it out of the stone. The gap behind it breathes cold, older air.
- else:
    A row of iron bars, thick with rust, set into a low opening in the wall. The space behind them is not the outside - it is close, and dim, and long forgotten.
}
-> room_return

= use_window
{ bars_pried:
    The bar is already out. The gap is there for the taking.
    -> room_return
}
{ inventory ? nail:
    ~ bars_pried = true
    You wedge the nail behind the most corroded of the bars and lever, throwing your weight against it until the old iron tears free of the crumbling mortar. A gap opens - narrow, but enough.
    -> room_return
}
You haul on the bars. They are set deep and mean to stay, and your fingers are no match for them.
-> room_return

= look_key
{ inventory ? key:
    A gaoler's key, heavy and black with rust. Cut for a single lock, and you can guess which.
- else:
    It hangs from an iron ring on the wall, catching the thin light. Big, rust-black, and cut for a lock that matters.
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
