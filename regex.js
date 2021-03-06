
/*
	Returns a random string which matches the regular expression
*/
function suggest(regex) {

	/*
		Constants
	*/

	var lower = 'abcdefghijklmnopqrstuvwxyz';
	var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var digit = '1234567890';
	var punct = range(33, 47) + range(58, 64) + range(91, 96) + range(123, 126);
	var whitespace = ' \r\t';
	var alpha = lower + upper;
	var word = lower + upper + digit + '_';
	var all = lower + upper + digit + punct;

	/*
		Parser state
	*/

	var source = regex.source;
	var pos = 0;
	var groups = [];



	/*
		Parser APIs
	*/

	function peek() {
		return source.charAt(pos);
	}
	function accept(c) {
		if (peek() === c) {
			++pos;
		} else {
			throw expected(c);
		}
	}
	function next() {
		var c = peek();
		accept(c);
		return c;
	}
	function more() {
		return pos < source.length;
	}
	/* backtrack the specified number of times, or no-arg to backtrack just once */
	function backtrack(times) {
		pos -= (times || 1);
		if (pos < 0) {
			throw 'Whoops! Backtracked before the beginning of the regex';
		}
	}
	/* captures the result of the expression, returning a memoized function */
	function capture(f) {
		var value;
		var memoized = function() {
			return value || (value = f());
		}
		groups.push(memoized);
		return memoized;
	}
	/* 1-based index of the capture group to reference */
	function captureGroup(n) {
		if (n < 1 || n > groups.length) {
			throw error('Invalid capture group ' + n);
		}
		return groups[n - 1];
	}



	/*
		Error messages
	*/

	function expected(c, actual) {
		actual = actual || peek();
		return error('Expected \'' + c + '\' but found \'' + actual + '\'');
	}
	function notImplemented(feature) {
		return error('Feature is not implemented: ' + feature);
	}
	function error(msg) {
		return 'Error at position ' + pos + ': ' + msg;
	}



	/*
		Suggestion generation
	*/

	function randomInterval(min, max) {
		return min + Math.floor(Math.random() * (max - min + 1));
	}
	/* creates a string with all characters from `begin` to `end`, inclusive.
	   accepts ASCII integer or charater value for `begin` and `end`. */
	function range(begin, end) {
		function toInt(x) {
			return typeof x === 'string' ? x.charCodeAt(0) : x;
		}
		begin = toInt(begin);
		end = toInt(end);

		if (begin > end) {
			throw error('Range is out of order');
		}

		var str = '';
		for (var i = begin; i <= end; ++i) {
			str += String.fromCharCode(i);
		}
		return str;
	}
	function constant(c) {
		return function() { return c; }
	}
	/* randomly selects one of `values`, where `values` is an array, object or string */
	function oneOf(values) {
		if (Object.prototype.toString.call(values) === '[object Object]') {
			// object used as a set, not an array
			values = Object.keys(values);
		}
		return function() { return values[randomInterval(0, values.length - 1)]; }
	}
	/* repeats function `f` randomly between [min, max] number of times */
	function repeat(f, min, max) {
		min = min || 0;
		max = max || 10;
		var count = randomInterval(min, max);
		return function() {
			var str = '';
			for (var i = 0; i < count; ++i) {
				str += f();
			}
			return str;
		}
	}
	/* convert an array or string into a set ("set" is just an object) */
	function arrayToSet(arr) {
		var result = Object.create(null);
		for (var i = 0; i < arr.length; ++i) {
			result[arr[i]] = true;
		}
		return result;
	}
	/* returns a new set containing the union of the two sets */
	function setUnion(setA, setB) {
		var a = Object.keys(setA);
		var b = Object.keys(setB);
		var result = Object.create(null);
		for (var i = 0; i < a.length; ++i) {
			result[a[i]] = true;
		}
		for (var i = 0; i < b.length; ++i) {
			result[b[i]] = true;
		}
		return result;
	}
	/* returns a new set containing the values from `A` which are not present in `B` */
	function setDifference(setA, setB) {
		var a = Object.keys(setA);
		var result = Object.create(null);
		for (var i = 0; i < a.length; ++i) {
			var key = a[i];
			if (!(key in setB)) {
				result[key] = true;
			}
		}
		return result;
	}
	/* returns a list of all characters except `values`, where `values` is an array, object or string */
	function not(values) {
		if (Object.prototype.toString.call(values) !== '[object Object]') {
			// convert array and string to object/set
			values = arrayToSet(values);
		}
		var diff = setDifference(arrayToSet(all), values);
		return Object.keys(diff);
	}


	/*
		Informal recursive descent parser using this BNF, roughly


		expression = term
		             term | expression

		term       = factor
		             factor term

		factor     = phrase
		             phrase *
		             phrase *?
		             phrase +
		             phrase ?
		             phrase {times}
		             phrase {min,}
		             phrase {min,max}

		phrase     = any
		             start
		             end
		             set
		             group
		             char

		any        = .

		start      = ^

		end        = $

		set        = [ setitems ]
		             [ ^ setitems ]

		setitems   = range
		             range setitems

		range      = setchar
		             setchar - setchar

		group      = ( expression )
		             (?: expression )

		char       = a .. z
		             A .. Z
		             0 .. 9
		             \n
		             \r
		             \t
		             \0
		             \ metachar
		             \ backreference

		setchar    = a .. z
		             A .. Z
		             0 .. 9
		             \n
		             \r
		             \t
		             \0
		             \ metachar

	*/


	/*
		expression = term
		             term | expression
	*/
	function expression() {
		// not using recursion because the choice should be uniformly distributed
		// e.g. a|b|c should have equal weight of 33% to each choice
		var terms = [term()];
		while(more() && peek() === '|') {
			accept('|');
			terms.push(term());
		}
		var choose = oneOf(terms);
		return function() {
			var chosen = choose();
			return chosen();
		}
	}

	/*
		term       = factor
		             factor term
	*/
	function term() {
		var f = factor();
		if (more() && peek() !== '|' && peek() !== ')') {
			var next = term();
			return function() { return f() + next(); }
		}
		return f;
	}

	/*
		factor     = phrase
		             phrase *
		             phrase +
		             phrase ?
		             phrase {times}
		             phrase {min,}
		             phrase {min,max}
	*/
	function factor() {
		var p = phrase();
		if (more()) {
			if(peek() === '*') {
				accept('*');
				if (peek() === '?') {
					// lazy quantifier ignored
					next();
				}
				return repeat(p, 0, undefined);
			} else if (peek() === '+') {
				accept('+');
				if (peek() === '?') {
					// lazy quantifier ignored
					next();
				}
				return repeat(p, 1, undefined);
			} else if (peek() === '?') {
				accept('?');
				return repeat(p, 0, 1);
			} else if (peek() === '{') {
				// '{' can be a repeat expression or a start of a literal
				// e.g. the expression /{a/ matches a literal {a
				// so we might have to do some backtracking
				accept('{');
				if (peek().match(/\d/)) {
					var min = next();
					while (peek().match(/\d/)) {
						min += next();
					}
					if (peek() === '}') {
						// {exact}
						accept('}');
						if (peek() === '?') {
							// lazy quantifier ignored
							next();
						}
						var count = parseInt(min);
						return repeat(p, count, count);
					} else if (peek() === ',') {
						accept(',');
						var max = '';
						while (peek().match(/\d/)) {
							max += next();
						}
						if (peek() === '}') {
							// {min,max}
							accept('}');
							if (peek() === '?') {
								// lazy quantifier ignored
								next();
							}
							return repeat(p, parseInt(min), parseInt(max));
						} else {
							// no closing brace for {min,max} expression (this is an error in JS)
							backtrack(min.length + max.length + 2);
							return p;
						}
					} else {
						// no closing brace for {count} expression
						backtrack(min.length + 1);
						return p;
					}
				} else {
					// no digit after opening brace
					backtrack(1);
					return p;
				}
			}
		}
		return p;
	}

	/*
		phrase     = any
		             start
		             end
		             set
		             group
		             char
	*/
	function phrase() {
		switch (peek()) {
			case '.': return any();
			case '^': return start();
			case '$': return end();
			case '[': return set();
			case '(': return group();
			default: return char();
		}
	}

	function any() {
		accept('.');
		return oneOf(all);
	}

	function start() {
		// make sure we're at the start of the string
		// also handle multiple ^^^ at the start
		for (var i = 0; i <= pos; ++i) {
			if (source.charAt(i) !== '^') {
				throw error('Start token can only occur at the start of the expression');
			}
		}
		accept('^');
		return constant('');
	}

	function end() {
		// make sure we're at the end of the string
		// also handle multiple $$$ at the end
		for (var i = pos; i < source.length; ++i) {
			if (source.charAt(i) !== '$') {
				throw error('End token can only occur at the end of the expression');
			}
		}
		accept('$');
		return constant('');
	}

	/*
		group      = ( expression )
		             (?: expression )

	*/
	function group() {
		accept('(');
		if (peek() === '?') {
			accept('?');
			switch (peek()) {
				case '=':
				case '!':
				case '<':
					throw notImplemented('lookaround');
			}
			accept(':');
			var expr = expression();
			accept(')');
			return expr;
		} else {
			// capture the expression before we recurse
			// to handle nested capture groups
			var captured = capture(function() { return expr(); });
			var expr = expression();
			accept(')');
			return captured;
		}
	}

	/*

		set        = [ setitems ]
		             [ ^ setitems ]
	*/
	function set() {
		// a dash '-' can represent a character range or a literal
		// depending on the characters to the left and right.
		// we are not handling all of these cases
		accept('[');
		if (peek() === '^') {
			accept('^');
			var negate = true;
		}

		// using a set here ensures an even distribution of choices
		// even if some values are repeated in the set
		var options = Object.create(null);
		while (more() && peek() !== ']') {
			var items = setitems();
			options = setUnion(options, arrayToSet(items));
		}

		accept(']');

		return negate ? oneOf(not(options)) : oneOf(options);
	}

	/*
		setitems  = range
		            range setitems
	*/
	function setitems() {
		var begin = setchar();

		// only character literals can be used in a range
		// a dash following a meta char with multiple choices is treated literally
		if (begin.length === 1 && peek() === '-') {
			// character range
			accept('-');

			var end = setchar();
			var choices = range(begin, end);
			return choices;
		}
		return begin;
	}

	/*
		char       = a .. z
		             A .. Z
		             0 .. 9
		             \n
		             \r
		             \t
		             \0
		             \ metachar
		             \ backreference
	*/
	function char() {
		var c = peek()
		if (c !== '\\') {
			// character literal
			accept(c);
			return constant(c);
		}

		if (!more()) {
			// backslash always needs to be followed by something
			throw expected('escape sequence');
		}

		accept('\\');
		var c2 = peek();
		switch (c2) {
			// escape sequences
			case 't': accept('t'); return constant('\t'); // tab
			case 'n': accept('n'); return constant('\n'); // newline
			case 'r': accept('r'); return constant('\r'); // carriage return
			case '0': accept('0'); return constant('\0'); // nil

			// meta sequences
			case 'w': accept('w'); return oneOf(word);
			case 'W': accept('W'); return oneOf(not(word)); // inverse of \w
			case 'd': accept('d'); return oneOf(digit);
			case 'D': accept('D'); return oneOf(not(digit)); // inverse of \d
			case 's': accept('s'); return oneOf(whitespace);
			case 'S': accept('S'); return oneOf(not(whitespace)); // inverse of \s
			case 'b': throw notImplemented('word boundary \\b'); // word boundary
			case 'B': throw notImplemented('inverse word boundary \\B'); // inverse of \b
			case 'u': throw notImplemented('unicode hex \\uFFFF');
			case 'x': throw notImplemented('hex \\xFF');
			case 'c': throw notImplemented('control character \\cX');

			// alternate syntax?
			// case 'A': return; // same as ^
			// case 'z': return; // same as $

			// TODO silent failures on these inputs
			// \ddd    octal
			// [\b]    backspace
		}

		if (c2.match(/[1-9]/)) {
			// capture group
			accept(c2);
			return captureGroup(parseInt(c2));
		}

		// treat escaped character as a literal
		accept(c2);
		return constant(c2)
	}

	/*
		A character inside of a set, e.g. [a]

		setchar    = a .. z
		             A .. Z
		             0 .. 9
		             \n
		             \r
		             \t
		             \0
		             \b
		             \ metachar

		Characters in sets have subtle differences to characters elsewhere.
		For example:
			\1 matches ASCII value 1 instead of a backreference
			\b matches backspace instead of a word boundary
			\B matches the literal B instead of an inverse word boundary

		This function also returns the characters themselves instead of a
		generator function in order to implement inverted sets.

	*/
	function setchar() {
		var c = peek()
		if (c !== '\\') {
			// character literal
			accept(c);
			return c;
		}

		if (!more()) {
			// backslash always needs to be followed by something
			throw expected('escape sequence');
		}

		accept('\\');
		var c2 = peek();
		switch (c2) {
			// escape sequences
			case 't': accept('t'); return '\t'; // tab
			case 'n': accept('n'); return '\n'; // newline
			case 'r': accept('r'); return '\r'; // carriage return
			case '0': accept('0'); return '\0'; // nil
			case 'b': accept('b'); return '\b'; // backspace

			// meta sequences
			case 'w': accept('w'); return word;
			case 'W': accept('W'); return not(word); // inverse of \w
			case 'd': accept('d'); return digit;
			case 'D': accept('D'); return not(digit); // inverse of \d
			case 's': accept('s'); return whitespace;
			case 'S': accept('S'); return not(whitespace); // inverse of \s
			case 'u': throw notImplemented('unicode hex \\uFFFF');
			case 'x': throw notImplemented('hex \\xFF');
			case 'c': throw notImplemented('control character \\cX');
		}

		// treat escaped character as a literal
		accept(c2);
		return c2;
	}

	/* add junk at the start and end of the string if no ^ or $ are present, respectively.
	   this won't functionally change the suggestion (it will match the regex either way),
	   but it's a visual indicator that the regex matches a subpattern of any string. */
	function withTerminators() {
		// add junk at the start if no terminator
		var before = peek() === '^' ? constant('') : repeat(oneOf(all));

		// generate a suggestion
		var expr = expression();
		if (more()) {
			throw expected('end of expression');
		}

		// add junk at the end if no terminator
		backtrack();
		var after = peek() === '$' ? constant('') : repeat(oneOf(all));

		// concat together
		return function() {
			return before() + expr() + after();
		};
	}

	var result = withTerminators()();

	// one final sanity check
	if (!result.match(regex)) {
		throw 'Whoops! The suggestion \'' + result + '\' doesn\'t match the regex';
	}
	return result;
};
