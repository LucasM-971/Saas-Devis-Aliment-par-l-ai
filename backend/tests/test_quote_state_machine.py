import pytest

from app.services.quote_state_machine import InvalidTransition, assert_transition, can_transition


def test_allowed_transition():
    assert can_transition("draft", "validated")


def test_forbidden_transition():
    assert not can_transition("draft", "sent")


def test_terminal_states_have_no_exit():
    assert not can_transition("rejected", "draft")
    assert not can_transition("expired", "sent")


def test_assert_raises_on_invalid():
    with pytest.raises(InvalidTransition):
        assert_transition("sent", "draft")


def test_assert_passes_on_valid():
    assert_transition("validated", "sent")  # ne doit pas lever
