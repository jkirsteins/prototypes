VAR push_count = 0
VAR call_count = 0
VAR lining_seen = false
VAR nail_seen = false
VAR nail_taken = false
VAR hinge_seen = false
VAR unsafe_memory = false
VAR build = "undetermined"
VAR strength = 0
VAR caution = 0
VAR ingenuity = 0
VAR escaped = false

LIST items = lining, nail, hinge, table, drawer, tinderbox, candle, hanging, cage, bucket
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
{ nail_taken:
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

+ {not lining_seen} [Feel along the velvet.]
    # image:coffin-lining
    ~ lining_seen = true
    ~ nail_seen = true
    Your fingers find a torn seam in the velvet, then a rough nub of metal beneath it. A nail, loose in its post.
    -> coffin_loop

+ {nail_seen and not nail_taken} [Work the loose nail free.]
    # image:coffin-nail
    ~ nail_taken = true
    You worry the nail back and forth until it gives up its tiny post. It is bent, sharp, and mean enough to matter.
    -> coffin_loop

+ {not hinge_seen} [Trace where the wood resists.]
    # image:coffin-hinge
    ~ hinge_seen = true
    You follow the resistance to one side. There: a cramped hinge, half-hidden behind the edge of the brass plate.
    -> coffin_loop

+ {nail_taken and hinge_seen} [Force the hinge with the nail.]
    # image:coffin-hinge
    ~ escaped = true
    ~ build = "ingenious"
    ~ ingenuity = ingenuity + 2
    You slide the nail into the hinge gap and twist until the metal complains.

    It is not a key. It is not a tool. But it is enough. The hinge buckles, and the wood above you swings open with the offended groan of old carpentry.
    -> lid_open

+ {lining_seen and not nail_taken} [Think about the loose nail.]
    # image:coffin-nail
    It is small, but it is the only thing in here that was not made to hold you.
    -> coffin_loop

+ {unsafe_memory} [Remember why calling out felt dangerous.]
    # image:coffin-echo
    You remember stopping yourself mid-shout.

    A prisoner who announces himself is either rescued or collected. You do not yet know which story this is.
    -> coffin_loop

=== lid_open ===
# image:lid-open
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
~ spotted += candle
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

=== room_return ===
{ current_room == "cell": -> cell_room_loop }
{ escaped: -> lid_open_loop }
-> coffin_loop

=== interact(verb, item) ===
{ verb == "look" and item == "table": -> look_table }
{ verb == "use" and item == "table": -> use_table }
{ verb == "look" and item == "drawer": -> look_drawer }
{ verb == "use" and item == "drawer": -> use_drawer }
{ verb == "look" and item == "tinderbox": -> look_tinderbox }
{ verb == "use" and item == "tinderbox": -> use_tinderbox }
{ verb == "look" and item == "candle": -> look_candle }
{ verb == "use" and item == "candle": -> use_candle }
{ verb == "look" and item == "hanging": -> look_hanging }
{ verb == "look" and item == "cage": -> look_cage }
{ verb == "look" and item == "bucket": -> look_bucket }
-> interact_fallback(verb, item)

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

=== interact_fallback(verb, item) ===
{ verb == "look":
    You study it a while longer. It tells you nothing new.
- else:
    You try it this way and that, and nothing comes of it.
}
-> room_return
