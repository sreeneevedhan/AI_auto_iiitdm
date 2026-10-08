# EventForm AI

EventForm AI is a small web app that creates feedback forms automatically from an event description.

Instead of manually deciding what questions to ask for every workshop, seminar, fest, or other event, the organizer just describes the event. The app uses Gemini to understand the event and generate relevant questions based on the sessions, activities, audience, speakers, and technical details mentioned.

The generated questions are then turned into an actual Google Form.

## What it does

- Takes an event description as input
- Uses Gemini to generate event-specific feedback questions
- Groups questions into relevant sections
- Supports different question types such as ratings, multiple choice, checkboxes, NPS, and text responses
- Creates a Google Form automatically
- Creates a Google Sheet for the responses
- Optionally emails the form and response links to the organizer

## How it works

The basic flow is:

```text
Event description
       ↓
Gemini
       ↓
Feedback questions
       ↓
Question validation
       ↓
Google Form
       ↓
Google Sheet
