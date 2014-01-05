
/*
	Returns a random string which matches the regular expression
*/
function suggest(regex) {
	var lower = 'abcdefghijklmnopqrstuvwxyz';
	var upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	var digit = '1234567890';
	var punct = range(33, 47) + range(58, 64) + range(91, 96) + range(123, 126);
	var whitespace = ' \r\t';
	var alpha = lower + upper;
	var word = lower + upper + digit + '_';
	var all = lower + upper + digit + punct;

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
	/* randomly selects one of `values`, where `values` is an array or string */
	function oneOf(values) {
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


	/*
		Parser, using this BNF... roughly


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

		range      = char
		             char - char

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
		if (more() && peek() !== '|' && peek() !== ')') { // TODO fix [)]
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
		accept('^');
		return constant(''); // TODO
	}

	function end() {
		accept('$');
		return constant(''); // TODO
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
			throw notImplemented('negated set');
		}

		var options = [];
		while (more() && peek() !== ']') {
			options.push(setitems());
		}

		accept(']');

		var choose = oneOf(options);
		return function() {
			var choice = choose();
			return choice();
		}
	}

	/*
		setitems  = range
		             range setitems
	*/
	function setitems() {
		// check for meta sequence
		if (peek() === '\\') {
			accept('\\');
			if (peek().match(/[AzwWdDsSbB1-9ux]/)) {
				// meta sequence
				backtrack();
				return char();
			}

			// not a meta sequence, continue as usual
			backtrack();
		}

		var begin = char();
		if (peek() === '-') {
			// character range
			accept('-');

			var end = char();
			var choices = range(begin(), end());
			return oneOf(choices);
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
			case 'W': throw notImplemented('inverse word \\W'); // inverse of \w
			case 'd': accept('d'); return oneOf(digit);
			case 'D': throw notImplemented('inverse digit \\D'); // inverse of \d
			case 's': accept('s'); return oneOf(whitespace);
			case 'S': throw notImplemented('inverse whitespace \\S'); // inverse of \s
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

// special chars /[^\.\(\)\+\?\*\[\]\|\\\^\$]/

// document.writeln(suggest(/abc.*/));
// document.writeln(suggest(/.+/));
// document.writeln(suggest(/a\+\+\\/));
// document.writeln(suggest(/\w\s\d/));
// document.writeln(suggest(/abc|def|xyz/));
// document.writeln(suggest(/xxxxx/));

// document.writeln(suggest(/[abc][\d][\r\n]/));
// document.writeln(suggest(/[abc]/));
// document.writeln(suggest(/[a-zA-Z123]/));
// document.writeln(suggest(/[\d-\d]/));

// document.writeln(suggest(/(a|b)?/));
// document.writeln(suggest(/^a$/));




// // email address
// document.writeln(suggest(/^[a-zA-Z]\w{3,20}@(gmail\.com|yahoo\.com|hotmail\.com)$/));

// // phone number with area code
// document.writeln(suggest(/^\(\d{3}\) \d{3}-\d{4}$/));

// // date in MM/DD/YYYY format with matching separator using capture groups
// document.writeln(suggest(/^(?:0[1-9]|1[012])([- \/.])(?:0[1-9]|[12][0-9]|3[01])\1(?:19|20)\d\d$/));




// nested capture group
// document.writeln(suggest(/(a(?:b)(x|y)) \1 \2/));




// broken
// document.writeln(suggest(/[)]/));
// document.writeln(suggest(/[1-\d]/));