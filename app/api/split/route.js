import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

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

    const ai = new GoogleGenAI({ apiKey });

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

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const responseText = response.text || '';
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
      else if (lower.includes('pizza') || lower.includes('burger')) description = 'food';
      else if (lower.includes('grocer')) description = 'groceries';
      else {
        description = sentence
          .replace(/(\d[\d,]*(\.\d+)?)/g, '')
          .replace(/\b(?:split|equally|between|among|across|with|people|friends|paid|had|for|by|just|me|only|and)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim() || 'expense';
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
