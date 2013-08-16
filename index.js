module.exports = init

var EOF = -1

function _(c) {
  return c.charCodeAt(0)
}

var OPTREE = JSON.parse(
    '{"33":{"61":{"61":{}}},"37":{"61":{}},"38":{"38":{},"61":{}},"40":{},' +
    '"41":{},"42":{"61":{}},"43":{"61":{}},"44":{},"45":{"61":{}},"46":{},' +
    '"47":{"61":{}},"58":{},"59":{},"60":{"60":{"61":{}},"61":{}},"61":{"6' +
    '1":{"61":{}},"62":{}},"62":{"61":{},"62":{"61":{},"62":{"61":{}}}},"6' +
    '3":{},"64":{},"91":{},"93":{},"94":{"61":{}},"123":{},"124":{"61":{},' +
    '"124":{}},"125":{},"126":{}}'
)

var ESCAPE_MAP = {
    98: _('\b')
  , 102: _('\f')
  , 110: _('\n')
  , 114: _('\r')
  , 116: _('\t')
  , 118: _('\v')
  , 39: _('\'')
  , 34: _('\"')
  , 92: _('\\')
}

function init(source) {
  var state = $start
    , pending = null
    , ended = false
    , last = null
    , buf = null
    , total = 0
    , idx = 0

  var transition_unlikely = {}
    , escaped_value = 0
    , pending_ws = []
    , transition = {}
    , escape_got = 0
    , curop = OPTREE
    , bytes = []
    , term

  transition[_('"')] = transition[_("'")] = $begin_string

  for(var i = 0; i < 9; ++i) {
    transition[_(i + '')] = $number
  }

  transition[_('.')] = $maybe_number
  transition[_(' ')] =
  transition[_('\t')] =
  transition[_('\n')] =
  transition[_('\r')] = $whitespace

  transition_unlikely[0xB] =
  transition_unlikely[0xC] =
  transition_unlikely[0xA0] =
  transition_unlikely[_('\u1680')] =
  transition_unlikely[_('\u180E')] =
  transition_unlikely[_('\u2000')] =
  transition_unlikely[_('\u2001')] =
  transition_unlikely[_('\u2002')] =
  transition_unlikely[_('\u2003')] =
  transition_unlikely[_('\u2004')] =
  transition_unlikely[_('\u2005')] =
  transition_unlikely[_('\u2006')] =
  transition_unlikely[_('\u2007')] =
  transition_unlikely[_('\u2008')] =
  transition_unlikely[_('\u2009')] =
  transition_unlikely[_('\u200A')] =
  transition_unlikely[_('\u202F')] =
  transition_unlikely[_('\u205F')] =
  transition_unlikely[_('\u3000')] =
  transition_unlikely[_('\uFEFF')] = $whitespace

  var op_symbols = '~`!@#%^&*()-=+{}[]|;,.><?/'.split('')

  for(var i = 0, len = op_symbols.length; i < len; ++i) {
    transition[_(op_symbols[i])] = $operator
  }

  transition[_('/')] = $maybe_regex_maybe_comment_maybe_op

  return {read: read, abort: source.abort}

  function accum(byt) {
    bytes[bytes.length] = byt
  }

  function emit(err) {
    if(err) {
      ended = true

      return pending(err)
    }

    var token
      , is_ws
      , ready

    token = {
        data: bytes
      , position: total
      , type: state.name
      , whitespace: null
    }
    is_ws = state === $whitespace ||
      state === $line_comment ||
      state === $block_comment

    if(!is_ws) {
      last = token
      last.whitespace = pending_ws.slice()
      pending_ws.length = 0

      ready = pending
      pending = null
      ready(null, last)
    } else {
      pending_ws[pending_ws.length] = token
    }

    curop = OPTREE
    bytes = []

    return $start
  }

  // --- parsers
  function $start(byt) {
    if(byt === EOF) {
      return $start
    }

    return transition[byt] || $identifier
  }

  function $maybe_regex_maybe_comment_maybe_op(byt) {
    ++idx

    return $mrmcmo
  }

  function $mrmcmo(byt) {
    if(transition[byt] === $maybe_regex_maybe_comment_maybe_op) {
      return $line_comment
    }

    if(byt === 42) { // /*
      ++idx

      return $block_comment_inner
    }

    // if the last thing we saw was an operator, and
    // the operator wasn't an end parentheses or
    // end bracket
    var probably_regexen = !last || (
        last.type === '$operator' &&
        last.data[0] !== 41 && last.data[0] !== 93
    )

    if(probably_regexen) {
      return $regex
    }

    accum(47)
    curop = OPTREE[47]
    ++idx

    return $operator
  }

  function $regex(byt) {
    ++idx

    if(byt === 92) {
      accum(byt)

      return $regex_escape
    }

    if(byt === EOF) {
      return emit(new Error('unexpected eof'))
    }

    if(byt !== 47) {
      accum(byt)

      return $regex
    }

    return emit(null)
  }

  function $regex_escape(byt) {
    accum(byt)
    ++idx

    return $regex
  }

  function $line_comment(byt) {
    if(byt === 0x0A || byt === EOF) {
      return emit(null)
    }

    accum(byt)
    ++idx

    return $line_comment
  }

  function $block_comment_inner(byt) {
    if(byt === 42) {
      ++idx

      return $block_comment
    }

    if(byt === EOF) {
      return emit(new Error('unexpected eof'))
    }

    accum(byt)
    ++idx

    return $block_comment_inner
  }

  function $block_comment(byt) {
    if(byt === EOF) {
      return emit(new Error('unexpected eof'))
    }

    if(byt === 47) {
      ++idx

      return emit(null)
    }

    accum(byt)

    return $block_comment_inner
  }

  function $begin_string(byt) {
    term = byt
    ++idx

    return $string
  }

  function $string(byt) {
    ++idx

    if(byt === 92) {
      return $escaped
    }

    if(byt !== term) {
      accum(byt)

      return $string
    }

    return emit(null)
  }

  function $escaped(byt) {
    escape_got =
    escaped_value = 0

    if(byt === 117) { // unicode
      ++idx

      return $string_unicode
    }

    if(byt === 120) { // hex
      ++idx

      return $string_hex
    }

    if(byt > 47 && byt < 56) {
      return $string_oct
    }

    // return to $string mode --
    // either gathering the escaped
    // bit or just ignoring the backslash.
    accum(ESCAPE_MAP[byt] || byt)
    ++idx

    return $string
  }

  function $string_hex(byt) {
    var is_hex = ((byt > 64 && byt < 71) ||
       (byt > 47 && byt < 58) ||
       (byt > 96 && byt < 103))

    if(escape_got === 2 || !is_hex) {
      accum(escaped_value)

      return $string
    }

    escaped_value = (escaped_value << 4) + (
        byt > 96 ? byt - 97 + 10 :
        byt > 64 ? byt - 65 + 10 :
        byt - 48
    )
    ++escape_got
    ++idx

    return $string_hex
  }

  function $string_oct(byt) {
    var is_oct = byt > 47 && byt < 56

    if(escape_got === 2 || !is_oct) {
      accum(escaped_value)

      return $string
    }

    escaped_value = (escaped_value << 3) + (
        byt - 48
    )
    ++escape_got
    ++idx

    return $string_oct
  }

  function $string_unicode(byt) {
    var is_hex = ((byt > 64 && byt < 71) ||
       (byt > 47 && byt < 58) ||
       (byt > 96 && byt < 103))

    if(escape_got === 4 || !is_hex) {
      accum(escaped_value)

      return $string
    }

    escaped_value = (escaped_value << 4) + (
        byt > 96 ? byt - 97 + 10 :
        byt > 64 ? byt - 65 + 10 :
        byt - 48
    )
    ++escape_got
    ++idx

    return $string_unicode
  }

  function $number(byt) {
    if(byt > 47 && byt < 58) {
      accum(byt)
      ++idx

      return $number
    }

    if(byt === _('.')) {
      accum(byt)
      ++idx

      return $decimal
    }

    if(byt === _('e') || byt === _('E')) {
      accum(byt)
      ++idx

      return $exponent_maybe_sign
    }

    if(byt === _('x') || byt === _('X')) {
      accum(byt)
      ++idx

      return $hexnumber
    }

    return emit(null)
  }

  function $hexnumber(byt) {
    var is_hex = ((byt > 64 && byt < 71) ||
       (byt > 47 && byt < 58) ||
       (byt > 96 && byt < 103))

    if(is_hex) {
      accum(byt)
      ++idx

      return $hexnumber
    }

    return emit(null)
  }

  function $decimal(byt) {
    if(byt > 47 && byt < 58) {
      accum(byt)
      ++idx

      return $decimal
    }

    return emit(null)
  }

  function $exponent_maybe_sign(byt) {
    var chr

    if(byt > 47 && byt < 58) {
      return $decimal
    }

    if(byt === 43 || byt === 45) { // + or -
      accum(byt)
      ++idx

      return $decimal
    }

    chr = String.fromCharCode(byt)

    return emit(
        new Error('expected "-", "+", or 0-9, got "' + chr + '"')
    )
  }

  function $maybe_number(byt) {
    if(byt === _('.')) {
      ++idx

      return $maybe_number
    }

    if(transition[byt] === $number) {
      accum(_('.'))

      return $decimal
    }

    $operator(_('.'))
    $operator(byt)
    --idx

    return $operator(byt)
  }

  function $identifier(byt) {
    if((byt > 47 && byt < 58) || !transition[byt]) {
      accum(byt)
      ++idx

      return $identifier
    }

    return emit(null)
  }

  function $whitespace(byt) {
    if(transition[byt] === $whitespace) {
      accum(byt)
      ++idx

      return $whitespace
    }

    return emit(null)
  }

  function $operator(byt) {
    var next = curop[byt]

    if(!next) {
      return emit(null)
    }

    accum(byt)
    ++idx
    curop = next

    return $operator
  }

  // ---
  function read(ready) {
    if(ended) {
      return ready()
    }

    if(pending) {
      throw new Error('overwriting callback')
    }

    pending = ready

    if(buf === null) {
      return source.read(onbytes)
    }

    onbytes(null, buf)

    if(pending) {
      var tmp = pending

      pending = null

      return read(tmp)
    }
  }

  function onbytes(err, data) {
    if(err) {
      return pending(err)
    }

    if(buf === null) {
      console.log('read', data.length)
    }

    if(data) {
      buf = data

      var start = idx
        , from


      for(var len = buf.length; buf && idx < len && pending; null) {
        state = state(buf[idx])
      }

      total += idx - start

      if(idx === len) {
        idx = 0
        buf = null
      }
    } else if(!ended) {
      state(EOF)
      ended = true

      if(pending) {
        var ready = pending

        pending = null
        ready()
      }

      return
    }
  }
}
