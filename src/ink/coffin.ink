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

-> start

=== start ===
# image:coffin
Darkness. The air is stale and tastes of dust.

Velvet presses against your shoulders. Wood waits inches above your face. Somewhere near your right hand, a small brass plate rasps softly when you breathe.

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
                # image:coffin-break
                ~ escaped = true
                ~ build = "strength"
                ~ strength = strength + 2
                The fifth shove is not elegant. It is not clever. It is a declaration.

                Metal screams, the wood above you bursts open, and you roll out onto cold stone with splinters in your palms.
                -> END
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
    -> END

+ {lining_seen and not nail_taken} [Think about the loose nail.]
    # image:coffin-nail
    It is small, but it is the only thing in here that was not made to hold you.
    -> coffin_loop

+ {unsafe_memory} [Remember why calling out felt dangerous.]
    # image:coffin-echo
    You remember stopping yourself mid-shout.

    A prisoner who announces himself is either rescued or collected. You do not yet know which story this is.
    -> coffin_loop
