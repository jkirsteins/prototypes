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
# mood:stale dark
You wake in a coffin.

Velvet presses against your shoulders. A coffin lid waits inches above your face. Somewhere near your right hand, a brass plaque rasps softly when you breathe.

{ push_count > 0:
Your arms remember the lid's weight.
}
{ unsafe_memory:
Your own shout still hangs in your mind: maybe this is unsafe. Maybe something outside heard.
}
{ nail_taken:
The loose nail rests in your fist, ugly and useful.
}

-> coffin_loop

=== coffin_loop ===
{ escaped:
    -> END
}

+ {not escaped} [Push the coffin lid.]
    ~ push_count = push_count + 1
    { push_count == 1:
        # image:coffin-strain
        You shove upward. The lid shifts just enough to prove it can move, then slams back into its groove.

        Your shoulders burn. The coffin answers with a wooden little laugh.
    - else:
        { push_count == 2:
            # image:coffin-strain
            You push again, harder. Dust falls into your mouth. Something near the hinge gives a tired click, but the lid holds.

            The sensible part of you suggests saving your strength. The rest of you disagrees.
        - else:
            # image:coffin-break
            ~ escaped = true
            ~ build = "strength"
            ~ strength = strength + 2
            The third shove is not elegant. It is not clever. It is a declaration.

            The hinge screams, the lid bursts open, and you roll out onto cold stone with splinters in your palms.

            BUILD SET: Strength-oriented.
            -> END
        }
    }
    -> coffin_loop

+ {call_count == 0} [Call for help.]
    # image:coffin-echo
    ~ call_count = call_count + 1
    ~ unsafe_memory = true
    You draw breath to shout, then stop halfway through the word.

    Maybe this is unsafe. You do not know where you are. You do not know who put you here. You do not know what might answer.

    MEMORY GAINED: Calling out may be dangerous.
    -> coffin_loop

+ {call_count == 1} [Call for help anyway.]
    # image:coffin-echo
    ~ call_count = call_count + 1
    ~ escaped = true
    ~ build = "cautious"
    ~ caution = caution + 2
    You call out, but not loudly. Not blindly. You shape the sound and listen between each word.

    A bolt scrapes somewhere outside. You go still before the lid opens, already measuring where the listener stands.

    BUILD SET: Caution-oriented.
    -> END

+ {not lining_seen} [Feel along the velvet lining.]
    # image:coffin-lining
    ~ lining_seen = true
    ~ nail_seen = true
    Your fingers find a torn seam in the velvet, then a rough nub of metal beneath it.

    CLUE FOUND: A loose nail is hidden in the lining.
    -> coffin_loop

+ {nail_seen and not nail_taken} [Unscrew the loose nail.]
    # image:coffin-nail
    ~ nail_taken = true
    You worry the nail back and forth until it gives up its tiny post. It is bent, sharp, and mean enough to matter.

    ITEM GAINED: Loose nail.
    -> coffin_loop

+ {not hinge_seen} [Search for the hinge.]
    # image:coffin-hinge
    ~ hinge_seen = true
    You follow the lid's resistance to one side. There: a cramped hinge, half-hidden behind the plaque's edge.

    CLUE FOUND: The hinge is the weak point.
    -> coffin_loop

+ {nail_taken and hinge_seen} [Break the hinge with the nail.]
    # image:coffin-hinge
    ~ escaped = true
    ~ build = "ingenious"
    ~ ingenuity = ingenuity + 2
    You slide the nail into the hinge gap and twist until the metal complains.

    It is not a key. It is not a tool. But it is enough. The hinge buckles, and the coffin lid opens with the offended groan of old carpentry.

    BUILD SET: Ingenuity-oriented.
    -> END

+ {lining_seen and not nail_taken} [Think about the loose nail.]
    # image:coffin-nail
    It is small, but it is the only thing in here that was not made to hold you.

    DEDUCTION: A bad tool is better than no tool.
    -> coffin_loop

+ {unsafe_memory} [Remember why calling out felt dangerous.]
    # image:coffin-echo
    You remember stopping yourself mid-shout.

    A prisoner who announces himself is either rescued or collected. You do not yet know which story this is.
    -> coffin_loop
