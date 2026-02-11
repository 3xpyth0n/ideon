<p align="center">
  <img src="https://www.theideon.com/images/ideon-text-logo.png" alt="Ideon logo" height="100" />
</p>

<p align="center">
  <strong>The Visual Hub for Everything Your Project Needs</strong><br/>
  A shared space to see, connect, and remember what your project is really about.
</p>

<p align="center">
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/code_style-prettier-pink.svg" alt="Prettier">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/actions/workflows/ci.yml">
    <img src="https://github.com/3xpyth0n/ideon/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/issues">
    <img src="https://img.shields.io/badge/contributions-welcome-brightgreen.svg" alt="Contributions welcome">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/commits/main">
    <img src="https://img.shields.io/github/last-commit/3xpyth0n/ideon" alt="Last commit">
  </a>
  <a href="https://github.com/3xpyth0n/ideon/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-AGPLv3-77b5fe.svg" alt="License">
  </a>
</p>

---

## What problem does Ideon solve?

Most projects do not fail because of bad execution.  
They fail because the context disappears.

Code lives in repositories.  
Designs live in design tools.  
Decisions live in chat threads.  
Links live in bookmarks.  
Notes live everywhere and nowhere.

After a few days away, the mental model is gone.  
People waste time reloading context instead of moving forward.

Ideon exists to reduce the cognitive cost of coming back to a project.

---

## What Ideon looks like in practice

<p align="center">
  <img
    src="https://www.theideon.com/images/features/real-usage.png"
    alt="Ideon workspace overview"
    width="900"
  />
</p>

This is a real Ideon workspace.

Each card is a live block.
Here you see the GitHub repository tracking active issues side-by-side with the roadmap note planning the next features.

Nothing is hidden behind folders or menus.
The entire project context is visible at a glance.

This is how we're building Ideon using Ideon.

---

## What Ideon is (and what it is not)

Ideon is a self-hosted visual workspace where everything related to a project lives on the same canvas.

It is not a replacement for GitHub, Figma, or your editor.  
It is the place where their relationships become explicit.

Instead of navigating folders and tabs, you look at a map.

---

## The core idea: projects as spaces, not directories

Ideon replaces abstract hierarchies with spatial organization.

You place blocks on a canvas:

- repositories
- notes
- links
- files
- people
- references
- anything that matters to the project

What is close is related.  
What is far is separate.  
What is connected is intentional.

The structure matches how humans actually think about projects.

---

## Core concepts

### Blocks

Each block represents one concrete thing:

- a GitHub repository
- a design mockup
- a document
- a contact or stakeholder
- plain text
- a link or file

Blocks are simple, explicit, and visible.

---

### Spatial organization

There is no imposed hierarchy.

You decide:

- what belongs together
- what depends on what
- what deserves focus
- what can stay in the background

The canvas becomes a shared mental model.

---

### Snapshots (time matters)

Ideon keeps snapshots of the entire workspace.

You can go back in time and see:

- what existed before a pivot
- how decisions evolved
- what context was present when a choice was made

This is not versioning of files.  
It is versioning of understanding.

---

### Multiplayer collaboration

Multiple people can work on the same space in real time.

Everyone sees:

- changes instantly
- where others are working
- how the project is structured

The project stops living in one person’s head.

---

### Magic Paste

Paste almost anything into Ideon:

- a Github URL
- text
- an image
- or any link/file

Ideon turns it into a structured block automatically.

Less friction.  
More structure, faster.

---

## Who is Ideon for?

Anyone who works on something that evolves over time:

- developers
- designers
- founders
- freelancers
- open-source maintainers
- students
- people who just want to organize their ideas or links

If context matters to you, Ideon is useful.

---

## Demo

You can try Ideon instantly using the hosted demo:

- URL: https://demo.theideon.com
- Username: `ideon-demo`
- Password: `ideon-demo`

No setup. No commitment.

---

## Requirements

- Docker

If you can run containers, you can run Ideon.

---

## Deployment

### Quick start

```bash
curl -fsSL https://install.theideon.com | sh
```

The installer:

- checks system requirements
- generates secure secrets
- creates configuration files
- starts the application and database containers

Access Ideon at:

```
http://localhost:3000
```

---

## Contributing

If you've ever wanted to contribute to open source, and a great cause, now is your chance!

Bug reports, feature ideas, documentation improvements, and code contributions all matter.

Start here:

- read [CONTRIBUTING.md](CONTRIBUTING.md)
- open an issue
- submit a pull request

Ideon grows through real use and real feedback.

---

## Contributors

### Creator

<table>
  <td align="center"><a href="https://portfolio.theideon.com"><img src="https://avatars1.githubusercontent.com/u/113543660?v=4" width="100px;" alt="Saad Idrissi"/><br /><sub><b>Saad Idrissi</b></sub></a><br /><a href="https://github.com/3xpyth0n/ideon/commits?author=3xpyth0n" title="Code">💻</a></td>
</table>

### Code Contributors

Thanks go to these wonderful people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://zorinos.com/ "><img src="https://avatars.githubusercontent.com/u/34811668?v=4?s=100" width="100px;" alt="albanobattistella"/><br /><sub><b>albanobattistella</b></sub></a><br /><a href="#translation-albanobattistella" title="Translation">🌍</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Solirix"><img src="https://avatars.githubusercontent.com/u/99198915?v=4?s=100" width="100px;" alt="Solirix"/><br /><sub><b>Solirix</b></sub></a><br /><a href="#security-Solirix" title="Security">🛡️</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://allcontributors.org) specification.
Contributions of any kind are welcome!

---

## License

AGPLv3.

If you deploy Ideon publicly and modify it, you are expected to share the changes.
