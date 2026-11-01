import { NextResponse } from 'next/server.js';

export function parseExpenseLocally(sentence) {
  const lower = sentence.toLowerCase();
  const wordNumbers = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const numberFromText = (value) => wordNumbers[value?.toLowerCase()] ?? Number(value);
  const currencyAmount = lower.match(/(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)/i);
  const forAmount = lower.match(/\b(?:for|cost(?:s)?|amount|total)\s+(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)/i);
  let amount = 0;
  if (currencyAmount?.[1]) {
    amount = Number(currencyAmount[1].replace(/,/g, ''));
  } else if (forAmount?.[1] && !/^(₹|rs|inr)/i.test(lower.trim())) {
    amount = Number(forAmount[1].replace(/,/g, ''));
  } else {
    const wordAmount = lower.match(/\b(?:for|cost(?:s)?|amount|total)\s+(one|two|three|four|five|six|seven|eight|nine|ten)\s+hundred\b/i)
      || lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+hundred\b/i);
    const allNumbers = [...sentence.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)];
    const amountCandidates = allNumbers
      .filter((match) => {
        const after = lower.slice(match.index + match[0].length);
        const before = lower.slice(0, match.index);
        return !/^\s+(?:people|persons|friends|others|ways|pax|heads)\b/i.test(after)
          && !/\b(?:people|persons|friends|others|ways|pax|heads)\s+$/.test(before);
      })
      .map((match) => Number(match[1].replace(/,/g, '')))
      .filter(Number.isFinite);
    amount = wordAmount
      ? numberFromText(wordAmount[1]) * 100
      : amountCandidates.reduce((largest, number) => Math.max(largest, number), 0);
  }

  let people = 1;
  const count = '\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve';
  const othersIncludingMe = lower.match(new RegExp(`(${count})\\s+(?:others?)\\s+(?:including|with)\\s+me`, 'i'));
  const friendsIncludingMe = lower.match(new RegExp(`(${count})\\s+(?:friends?)\\s+(?:including|with)\\s+me`, 'i'));
  const peopleIncludingMe = lower.match(new RegExp(`(${count})\\s+(?:people|persons?)\\s+(?:including|with)\\s+me`, 'i'));
  const ofUs = lower.match(new RegExp(`(${count})\\s+of\\s+us`, 'i'));
  const friends = lower.match(new RegExp(`(?:split|shared?|divided?)\\s+with\\s+(${count})\\s+(?:friends?|mates?)\\b`, 'i'));
  const splitWith = lower.match(new RegExp(`(?:split|shared?|divided?)\\s+with\\s+(${count})\\s+(?:people|persons?|others?)\\b`, 'i'));
  const splitWays = lower.match(new RegExp(`(?:split|divided?|shared?)\\s+(?:(?:equally|evenly)\\s+)?(?:by|between|among|across|\\/\\s*)(${count})\\s*(?:people|persons?|ways?|pax|heads)?\\b`, 'i'));
  const splitEvenlyBeforeCount = lower.match(new RegExp(`(?:split|shared?|divided?)\\s+(?:equally|evenly)\\s+(${count})\\s+(?:people|persons?|ways?)\\b`, 'i'));
  const standaloneWays = lower.match(new RegExp(`(?:split|divided?|shared?)\\s+(?:(?:equally|evenly)\\s+)?(${count})\\s+ways?\\b`, 'i'));
  const standaloneBetween = lower.match(new RegExp(`\\b(?:between|among|by)\\s+(${count})\\s*(?:people|persons?|friends?|pax|heads)?\\b`, 'i'));
  const explicitPeople = lower.match(new RegExp(`(${count})\\s+(?:people|persons?|pax|heads)\\b(?!\\s+(?:including|with)\\s+me)`, 'i'));
  const friendsWithoutInclusion = lower.match(new RegExp(`(?:^|\\bwith\\s+)(${count})\\s+friends?\\b(?!\\s+(?:including|with)\\s+me)`, 'i'));
  const standaloneFriends = lower.match(new RegExp(`(?:^|[,;]\\s*)(${count})\\s+friends?\\b(?!\\s+(?:including|with)\\s+me)`, 'i'));
  const countBeforeSplit = lower.match(new RegExp(`^(${count})\\s+(?:people|persons?|friends?|pax|heads)\\b`, 'i'));
  const namedPeople = lower.match(/(?:^|[:;,])\s*(?:me|i)\s*(?:,|\band\b)\s*(.+?)\s+(?:had|paid|spent)\b/i);
  const solo = /\b(just me|only me|solo|for myself|myself only)\b/i.test(lower);
  const firstCaptured = (match) => match ? Number(numberFromText(match[1] || match[2] || match[3])) : 0;

  if (solo) people = 1;
  else if (othersIncludingMe) people = firstCaptured(othersIncludingMe) + 1;
  else if (friendsIncludingMe) people = firstCaptured(friendsIncludingMe) + 1;
  else if (peopleIncludingMe) people = firstCaptured(peopleIncludingMe);
  else if (ofUs) people = firstCaptured(ofUs);
  else if (splitWith) people = firstCaptured(splitWith) + 1;
  else if (friends) people = firstCaptured(friends) + 1;
  else if (friendsWithoutInclusion) people = firstCaptured(friendsWithoutInclusion) + 1;
  else if (standaloneFriends) people = firstCaptured(standaloneFriends) + 1;
  else if (countBeforeSplit) people = firstCaptured(countBeforeSplit);
  else if (splitWays) people = firstCaptured(splitWays);
  else if (splitEvenlyBeforeCount) people = firstCaptured(splitEvenlyBeforeCount);
  else if (standaloneWays) people = firstCaptured(standaloneWays);
  else if (standaloneBetween) people = firstCaptured(standaloneBetween);
  else if (explicitPeople) people = firstCaptured(explicitPeople);
  else if (namedPeople) {
    const names = namedPeople[1].split(/\s*,\s*|\s+and\s+/i).filter((name) => name.trim());
    people = names.length + 1;
  }

  people = Math.max(1, people);

  let description = 'expense';
  const knownItems = [
    ['movie tickets', 'movie tickets'], ['movie ticket', 'movie ticket'], ['movie', 'movie'],
    ['groceries', 'groceries'], ['grocery', 'groceries'], ['vegetables', 'vegetables'],
    ['electricity', 'electricity'], ['internet', 'internet'], ['wifi', 'wifi'], ['rent', 'rent'],
    ['dinner', 'dinner'], ['lunch', 'lunch'], ['breakfast', 'breakfast'], ['pizza', 'pizza'],
    ['burger', 'burger'], ['coffee', 'coffee'], ['tea', 'tea'], ['chai', 'chai'],
    ['cab', 'cab'], ['taxi', 'taxi'], ['uber', 'uber'], ['shopping', 'shopping'],
    ['fuel', 'fuel'], ['petrol', 'petrol'], ['medicine', 'medicine'],
    ['electronics', 'electronics'], ['electronic', 'electronics'],
  ];
  for (const [phrase, title] of knownItems) {
    if (lower.includes(phrase)) {
      description = title;
      break;
    }
  }

  if (description === 'expense') {
    const cleaned = sentence
      .replace(/(?:₹|rs\.?|inr)\s*/gi, '')
      .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, '')
      .replace(/\b(?:split|sharing|shared|equally|evenly|between|among|across|with|people|persons?|friends?|others?|ways?|including|pax|heads|of|us|me|and|for|to|paid|cost|costs|amount|total|by|the|just|only|myself|solo|each)\b/gi, ' ')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    description = cleaned.toLowerCase() || 'expense';
  }

  return {
    amount,
    people,
    each: people > 0 ? Number((amount / people).toFixed(2)) : amount,
    description,
    confidence: amount > 0 ? 1 : 0,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const sentence = body.sentence || body.text || '';

    if (!sentence || typeof sentence !== 'string') {
      return NextResponse.json(
        { error: 'Please provide a sentence describing the expense.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    const prompt = `You are an expert expense-splitting calculator for natural human sentences.
Analyze the user's sentence and extract the expense split.

Rules for counting "people":
- "split [equally] by / between / among / across N [people / ways]": total of N people (e.g. "dinner 4000 split equally by 3" = 3 people, "split between 4" = 4 people, "split 3 ways" = 3 people).
- "divided [equally] by N": total of N people.
- List of names/people: count each person mentioned (e.g. "me, raj and priya" = 3 people: me + raj + priya).
- "split with N friends / people": means the speaker plus N friends (e.g. "split with 2 friends" = 1 + 2 = 3 people).
- "N of us" / "N people including me": is the total group, including the speaker (e.g. "4 of us" = 4 people; "3 people including me" = 3 people).
- "N others including me": means N other people plus the speaker (e.g. "3 others including me" = 4 people).
- When a sentence gives an expense split as "N of us" or says an expense is shared with other people, include the speaker in the total. "3 of us" means 3 people total, not 3 other people.
- "just me / solo / for myself / only me": 1 person.
- If no count or group is mentioned, default "people" to 1.

Rules for fields:
- "amount": Total cost as a number (without currency symbols).
- "people": Total count of people sharing the cost (integer, minimum 1).
- "each": amount divided by people (number, rounded to 2 decimal places).
- "description": Concise lowercase title (e.g. "dinner", "cab", "coffee").
- Preserve the expense name when the sentence contains one. Do not replace specific items with generic categories (e.g. "pizza" stays "pizza", "movie" stays "movie", and "burger" stays "burger").

Examples:
- "dinner 4000 split equally by 3" -> {"amount": 4000, "people": 3, "each": 1333.33, "description": "dinner"}
- "me, raj and priya had dinner for 1200" -> {"amount": 1200, "people": 3, "each": 400, "description": "dinner"}
- "900 cab, split with 2 friends" -> {"amount": 900, "people": 3, "each": 300, "description": "cab"}
- "coffee 300, just me" -> {"amount": 300, "people": 1, "each": 300, "description": "coffee"}
- "1500 for groceries, 4 of us" -> {"amount": 1500, "people": 4, "each": 375, "description": "groceries"}

Now analyze this sentence:
"${sentence}"

Return ONLY a strict JSON object with keys: "amount", "people", "each", "description". No markdown, no fences, no extra text.`;

    let parsed = null;
    const localParsed = parseExpenseLocally(sentence);
    if (localParsed.confidence) {
      return NextResponse.json({
        amount: localParsed.amount,
        people: localParsed.people,
        each: localParsed.each,
        description: localParsed.description,
      });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Gemini request failed with status ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Strip any ``` fences before JSON.parse
      const cleaned = responseText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (apiError) {
      console.warn('Gemini API temporary spike, using fallback parser:', apiError.message);

      const lower = sentence.toLowerCase();

      // Detect amount
      let amount = 0;
      const forAmountMatch = lower.match(/(?:for|amount|cost|rs\.?|inr|₹)\s*(\d[\d,]*(\.\d+)?)/);
      const allNumbers = [...sentence.matchAll(/(\d[\d,]*(\.\d+)?)/g)].map(m => Number(m[1].replace(/,/g, '')));
      
      if (forAmountMatch) {
        amount = Number(forAmountMatch[1].replace(/,/g, ''));
      } else if (allNumbers.length > 0) {
        amount = Math.max(...allNumbers);
      }

      // Detect people
      let people = 1;
      const splitWithMatch = lower.match(/split\s+with\s+(\d+)\s*(?:friends?|people|others?|guys?)?/i);
      const splitWaysMatch = lower.match(/(?:split|divide|divided)\s+(?:equally\s+)?(?:by|between|among|across|\/)\s*(\d+)/i);
      const nWaysMatch = lower.match(/(?:split|divide|divided)\s+(\d+)\s*ways/i);
      const forNPeopleMatch = lower.match(/(?:for|between|among)\s+(\d+)\s+(?:people|persons|friends|pax|heads)/i);
      const ofUsMatch = lower.match(/(\d+)\s+of\s+us/i);
      const othersIncludingMeMatch = lower.match(/(\d+)\s+others?\s+(?:including|with)\s+me/i);
      const includingMeMatch = lower.match(/(\d+)\s+(?:people|persons)\s+(?:including|with)\s+me/i);

      if (splitWithMatch && Number(splitWithMatch[1]) > 0) {
        people = 1 + Number(splitWithMatch[1]); // me + N friends
      } else if (splitWaysMatch && Number(splitWaysMatch[1]) > 0) {
        people = Number(splitWaysMatch[1]);
      } else if (nWaysMatch && Number(nWaysMatch[1]) > 0) {
        people = Number(nWaysMatch[1]);
      } else if (forNPeopleMatch && Number(forNPeopleMatch[1]) > 0) {
        people = Number(forNPeopleMatch[1]);
      } else if (ofUsMatch && Number(ofUsMatch[1]) > 0) {
        people = Number(ofUsMatch[1]);
      } else if (othersIncludingMeMatch && Number(othersIncludingMeMatch[1]) > 0) {
        people = 1 + Number(othersIncludingMeMatch[1]);
      } else if (includingMeMatch && Number(includingMeMatch[1]) > 0) {
        people = Number(includingMeMatch[1]);
      } else if (lower.includes('just me') || lower.includes('only me') || lower.includes('solo') || lower.includes('myself')) {
        people = 1;
      } else if (lower.includes('me') && (lower.includes('and') || lower.includes(','))) {
        const namesSegment = lower.split(/had|for|paid|spent/)[0];
        const names = namesSegment.split(/,|\band\b/).map(s => s.trim()).filter(Boolean);
        if (names.length > 1) people = names.length;
      }

      // Detect description
      let description = 'expense';
      if (lower.includes('dinner')) description = 'dinner';
      else if (lower.includes('cab') || lower.includes('taxi') || lower.includes('uber')) description = 'cab';
      else if (lower.includes('coffee') || lower.includes('tea') || lower.includes('chai')) description = 'coffee';
      else if (lower.includes('lunch')) description = 'lunch';
      else if (lower.includes('pizza')) description = 'pizza';
      else if (lower.includes('burger')) description = 'burger';
      else if (lower.includes('grocer')) description = 'groceries';
      else {
        description = sentence
          .replace(/(\d[\d,]*(\.\d+)?)/g, '')
          .replace(/\b(?:split|equally|between|among|across|with|people|persons|friends|paid|had|for|by|just|me|only|and|of|us|ways?|each|rupees?|amount|cost)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim() || 'expense';

        const descriptionWords = description
          .replace(/[^\p{L}\p{N}\s-]/gu, '')
          .trim();
        description = descriptionWords || 'expense';
      }

      const each = people > 0 ? Number((amount / people).toFixed(2)) : amount;

      parsed = {
        amount,
        people,
        each,
        description: description.toLowerCase(),
      };
    }

    // Ensure strict numeric and string types for the 4 keys
    const amount = Number(parsed.amount || 0);
    const people = Number(parsed.people || 1);
    const each = Number(parsed.each !== undefined ? parsed.each : (people > 0 ? Number((amount / people).toFixed(2)) : amount));
    const description = String(parsed.description || 'expense').toLowerCase();

    return NextResponse.json({
      amount,
      people,
      each,
      description,
    });
  } catch (error) {
    console.error('Error in /api/split:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
