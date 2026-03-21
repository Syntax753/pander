# General

The sections that follow are names of levels. Each level can contain different combinations of characters. You can customize characters in the separate /public/characters.md file, including making variants of other characters that behave differently. For example, suppose you want a clown that is more of an evil clown than a traditional one - copy the "# Clown" section to an "# Evil Clown" section and add "terror" and "suffering" to its likes.

You can add a custom function for happiness evaluation in any level by specifying the optional "happinessFunction" settings. For example:

`# Your Level
* Laconian=50
* Persian=30
* happinessFunction=findLaconicHappinessChange`

And you would implement a function following the FindHappinessChangeCallback signature like:

`async function findLaconicHappinessChange(playerText:string, audienceMember:AudienceMember):Promise<number> {
  if (audienceMember.characterId === 'Laconian' && playerText.length > 20) return -1; // They hate long-winded speech.
}`

And you'd bind your custom function to the GameSession instance with code like:

`gameSession.bindFindHappinessFunctions([findLaconicHappinessChange]);`

Then when `gameSession.startLevel('Your Level')` is called, the custom happiness function will be used to make updates to happiness.

# At The Library

* Librarian=8
* Clown=1
* Hodler=1

# Middling Crowd

* Jock=3
* Clown=2
* Librarian=3
* Cat Lady=1
* Plumber=4
* Barber=5
* Ice Skater=3
* Mogger=4
* Artist=3
* Hodler=2

# Theater

* Jock=10
* Clown=5
* Librarian=12
* Cat Lady=5
* Plumber=20
* Barber=10
* Ice Skater=7
* Mogger=8
* Artist=6
* Hodler=5

# Stadium Rally

* Jock=30
* Clown=20
* Librarian=30
* Cat Lady=10
* Plumber=40
* Barber=50
* Ice Skater=30
* Mogger=40
* Artist=30
* Hodler=20
# Card Prototype

* Jock=1
* Clown=1
* Librarian=1
* Plumber=1
* Hodler=1
