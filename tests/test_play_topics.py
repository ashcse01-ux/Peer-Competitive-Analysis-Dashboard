"""Unit tests for Play Store topic helpers and download/histogram parsers."""

from scraper.play_topics import (
    PLAY_TOPIC_KEYS,
    histogram_from_reviews,
    normalize_histogram,
    parse_downloads,
    score_topics_from_reviews,
)


def test_parse_downloads_string():
    label, raw = parse_downloads("1,000,000+")
    assert label == "1,000,000+"
    assert raw == 1_000_000


def test_parse_downloads_int():
    label, raw = parse_downloads(50000)
    assert raw == 50000
    assert "50,000" in label


def test_normalize_histogram_list():
    hist = normalize_histogram([10, 20, 30, 40, 50])
    assert hist["star_1"] == 10
    assert hist["star_5"] == 50


def test_histogram_from_reviews():
    reviews = [
        {"star_rating": 5},
        {"star_rating": 5},
        {"star_rating": 1},
        {"star_rating": None},
    ]
    hist = histogram_from_reviews(reviews)
    assert hist["star_5"] == 2
    assert hist["star_1"] == 1
    assert hist["star_3"] == 0


def test_score_topics_from_reviews():
    reviews = [
        {"review_text": "Booking was smooth and easy", "star_rating": 5},
        {"review_text": "App crashes and lag every time", "star_rating": 1},
        {"review_text": "Great value for money on this bus", "star_rating": 4},
    ]
    topics = score_topics_from_reviews(reviews)
    assert set(topics.keys()) == set(PLAY_TOPIC_KEYS)
    assert topics["booking_experience"] == 5.0
    assert topics["performance"] == 1.0
    assert topics["value_for_money"] == 4.0
