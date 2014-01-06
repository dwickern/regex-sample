
$(document).ready(function() {

	function go(regex) {
		var success = $('#success');
		var error = $('#error');
		try {
			regex = new RegExp(regex);
			var suggestion = suggest(regex);
			success.text(suggestion);
			error.hide();
		} catch (err) {
			success.text('');
			error.text(err);
			error.show('fast');
		}
	}

	$('#generate-button').click(function() {
		var regex = $('#regex-input').val();
		go(regex);
	});

	$('.examples a').click(function(e) {
		var elem = e.target;
		var regex = $(elem).data('regex');
		$('#regex-input').val(regex);
		go(regex);
	});
});